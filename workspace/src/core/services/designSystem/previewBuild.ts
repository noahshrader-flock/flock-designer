import { createHash } from 'node:crypto';
import { constants, copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import PREVIEW_PAGE from '../../../page/preview?page';
import { packageFirst, packagesOf, previewSetup, storybookDefines } from './storybookSetup';
import { exportCommit } from '../platform/git';
import type { BuildContext, BuildOptions, Plugin } from 'esbuild';
import { ASSET_TYPES } from '../prototypes/prototypeServer';
import { type Stylesheets, stylesheetsFor } from './stylesheets';
import { withPageTheme } from '../browser/pageTheme';
import { INK } from '../../../shared/pageInk';

/**
 * How a design system's previews are built: the page, the entry generated for the library, esbuild configured as its own
 * Storybook builds it, a copy at a commit with its packages linked in, and a build kept open to try a change on. Which
 * builds are kept, served and cleared is `storyPreviews.ts`.
 */

/** The page every preview frame loads. Plain styles of its own: the stories bring the library's. */
export const PAGE = `<!doctype html>
<html>
	<head>
		<meta charset="utf-8" />
		<link rel="stylesheet" href="./entry.css" />
		<style>
			body { margin: 0; padding: 16px; background: ${INK.paper}; }
			.fd-story { margin: 0 0 24px; }
			.fd-story:last-child { margin-bottom: 0; }
			.fd-name { margin: 0 0 8px; font: 500 12px/1.4 -apple-system, system-ui, sans-serif; color: ${INK.muted}; }
			.fd-error { margin: 0; color: ${INK.error}; white-space: pre-wrap; font: 12px/1.4 ui-monospace, monospace; }
		</style>
	</head>
	<body>
		<div id="root"></div>
		<script type="module" src="./entry.js"></script>
	</body>
</html>
`;

/**
 * The page's entry: only what must be the library's own (React, Storybook, its preview set-up and story files), handed to
 * the page's code (`page/preview.ts`). It tells the frame's owner its height and nothing else, and hears from it only the
 * values to try on the component's instances.
 */
export const previewEntry = (
	library: string,
	storyFiles: string[],
	{ preview, channel, folder = '' }: { preview: string | null; channel: boolean; folder?: string },
): string => {
	// Every file by its path from the entry, which is in the design system's package of the copy: a build of any copy of the
	// commit builds its own files.
	const fromEntry = (path: string) => {
		const from = relative(join(library, folder), path).split(sep).join('/');
		return from.startsWith('../') ? from : `./${from}`;
	};
	return `
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { composeStories, setProjectAnnotations } from '@storybook/react';
${preview === null ? '' : `import * as preview from ${JSON.stringify(fromEntry(preview))};`}

const files = {
${storyFiles.map((f) => `\t${JSON.stringify(f)}: () => import(${JSON.stringify(fromEntry(join(library, f)))}),`).join('\n')}
};

${PREVIEW_PAGE}
__fdPage.startPreview({
	React,
	createRoot,
	flushSync,
	composeStories,
	setProjectAnnotations,
	preview: ${preview === null ? 'null' : 'preview'},
	files,
	channel: ${channel ? "Promise.all([import('storybook/internal/preview-api'), import('storybook/internal/core-events')])" : 'Promise.resolve(null)'},
});
`;
};

/** Whether the clone has the packages a preview is built from: React, and Storybook's portable stories. */
export const hasPackages = (root: string, exists: (p: string) => boolean = existsSync): boolean =>
	['react', 'react-dom', join('@storybook', 'react')].every((p) => exists(join(root, 'node_modules', p, 'package.json')));

/** What a build step that is not installed here says when a story uses it, in the story's own card. */
export const notInstalled = (what: string): string => `Not installed here: ${what}. Run npm install in the library, then sync.`;

/**
 * What the library's own Storybook set-up gives its build: its stylesheets as it makes them, a package's stylesheet by
 * path even when unlisted, and nothing for `.mdx`. `missing` (not installed, or generated at install time) become stand-ins
 * that throw only when a story reaches for them, so the stories that do not need them still build.
 */
const libraryBuild = (packages: string[], stylesheets: Stylesheets, missing: ReadonlySet<string>): Plugin => ({
	name: 'library',
	setup(b) {
		// A stylesheet named bare is resolved as any import is (a package's exports, a path beside it); one its package does
		// not list is found by its path in the packages installed.
		b.onResolve({ filter: /^[^./].*\.s?css$/ }, async (a) => {
			if (a.pluginData === 'stylesheet') return undefined;
			const found = await b.resolve(a.path, { kind: a.kind, resolveDir: a.resolveDir, importer: a.importer, pluginData: 'stylesheet' });
			if (found.errors.length === 0) return found;
			const installed = packages.map((p) => join(p, a.path)).find((p) => existsSync(p));
			return installed === undefined ? undefined : { path: installed };
		});
		if (missing.size > 0) {
			b.onResolve({ filter: /.*/ }, async (a) => {
				if (a.pluginData === 'inner' || !missing.has(a.path)) return undefined;
				const found = await b.resolve(a.path, { kind: a.kind, resolveDir: a.resolveDir, importer: a.importer, pluginData: 'inner' });
				return found.errors.length === 0 ? found : { path: a.path, namespace: 'missing' };
			});
			b.onLoad({ filter: /.*/, namespace: 'missing' }, (a) => ({
				// What esbuild makes of a named import from this reads it through the module's prototype, so that is what throws.
				contents: `const say = new Proxy({}, { get(_, k) { if (typeof k === 'symbol' || k === '__esModule' || k === 'then') return undefined; throw new Error(${JSON.stringify(notInstalled(a.path))}); } });
module.exports = new Proxy({}, { getPrototypeOf: () => say, get: (_, k) => say[k] });`,
				loader: 'js',
			}));
		}
		b.onLoad({ filter: /\.mdx$/ }, () => ({ contents: 'export default () => null;', loader: 'js' }));
		stylesheets.setup(b);
	},
});

type BuildErrors = { errors: { text: string; location?: { file: string } | null }[] };

/** A build's failure as its errors, as a build that worked has none. */
const asErrors = (err: Partial<BuildErrors>): BuildErrors => ({ errors: err.errors ?? [{ text: String(err) }] });

const ENTRY = 'preview-entry.tsx';
/** The packages a copy's design system builds with that are installed, its package's first: what a stylesheet is found in. */
const installedPackages = (library: string, folder: string): string[] => packagesOf(library, folder).filter((p) => existsSync(p));
/** What the preview page is built with, with the globals the library's own Storybook build defines and React's production build. */
const optionsFor = (library: string, folder: string, site: string, plugin: Plugin, defines: Record<string, string>): BuildOptions => ({
	// In the design system's package, so its imports resolve from its own packages first, hoisted to the root or not.
	entryPoints: { entry: join(library, folder, ENTRY) },
	// Errors name files as the library does (`src/components/…`), not by where the copy is.
	absWorkingDir: library,
	bundle: true,
	splitting: true,
	format: 'esm',
	platform: 'browser',
	jsx: 'automatic',
	minify: true,
	outdir: site,
	// Fonts and pictures are written as files beside the page: exactly the kinds the server will send.
	loader: Object.fromEntries(Object.keys(ASSET_TYPES).map((e) => [e, 'file' as const])),
	define: { ...defines, 'process.env.NODE_ENV': '"production"' },
	logLevel: 'silent',
	plugins: [plugin],
});

/**
 * Runs a build, setting aside only what is not installed here, and only once: any other error is the build's own and is
 * thrown as it is, naming its files.
 */
const settled = async (attempt: (missing: ReadonlySet<string>) => Promise<BuildErrors>): Promise<void> => {
	let result = await attempt(new Set());
	if (result.errors.length > 0 && result.errors.every((e) => /Could not resolve/.test(e.text))) result = await attempt(unresolved(result.errors));
	if (result.errors.length > 0) {
		throw new Error(
			result.errors
				.slice(0, 5)
				.map((e) => (e.location ? `${e.location.file}: ${e.text}` : e.text))
				.join('\n'),
		);
	}
};

/** The specifiers a build could not resolve, from its errors: what `libraryBuild` makes stand-ins for. */
export const unresolved = (errors: { text: string }[]): Set<string> =>
	new Set(errors.map((e) => /Could not resolve "(.+?)"/.exec(e.text)?.[1]).filter((m): m is string => m !== undefined));

/**
 * Builds every story file into `site`, from the copy of the library at `library`, with the Storybook set-up of the design
 * system's package (`folder`, in a monorepo) or else the repository's. Throws with the build's own words.
 */
export const buildPreviews = async (library: string, storyFiles: string[], site: string, folder = ''): Promise<void> => {
	const [{ build }, sass] = await Promise.all([import('esbuild'), import('sass')]);
	const packages = installedPackages(library, folder);
	const preview = previewSetup(library, folder);
	// Storybook 8 and later have the `storybook` package, which carries its preview's channel; older ones do not.
	const channel = packages.some((p) => existsSync(join(p, 'storybook', 'package.json')));
	writeFileSync(join(library, folder, ENTRY), previewEntry(library, storyFiles, { preview, channel, folder }));
	mkdirSync(site, { recursive: true });
	const stylesheets = stylesheetsFor(library, folder, sass);
	const defines = storybookDefines(library, folder);
	try {
		await settled((missing) => build(optionsFor(library, folder, site, libraryBuild(packages, stylesheets, missing), defines)).catch(asErrors));
	} finally {
		stylesheets.close();
	}
	writeFileSync(join(site, 'index.html'), withPageTheme(PAGE));
};

/** The previews built again with a change: built with a change's files, as often as the change changes; closed when done. */
export interface TrialBuild {
	build(files: Map<string, string>): Promise<void>;
	dispose(): Promise<void>;
}

/**
 * The previews built again with a change in `work`, a copy of `copy` of its own, so the change's files are on disk where
 * every tool reads (Tailwind's scan, Sass's partials) and no other build sees them. Kept open between changes, so each is
 * esbuild's incremental rebuild (about a second); each build puts back the files the last one wrote.
 */
export const trialBuild = async (copy: string, work: string, site: string, folder = ''): Promise<TrialBuild> => {
	const [{ context }, sass] = await Promise.all([import('esbuild'), import('sass')]);
	// A clone of each file where the disk can (copy-on-write, so all but free), a copy where not; its packages stay a link.
	if (!existsSync(work)) cpSync(copy, work, { recursive: true, verbatimSymlinks: true, mode: constants.COPYFILE_FICLONE });
	const packages = installedPackages(work, folder);
	const stylesheets = stylesheetsFor(work, folder, sass);
	// esbuild and the stylesheets' tools name a file by its real path, and a temporary folder can be reached through a link
	// (macOS's /var); a change names its files by their path in the library.
	const roots = [...new Set([work, realpathSync(work)])];
	const putBack = (file: string) => {
		if (existsSync(join(copy, file))) copyFileSync(join(copy, file), join(work, file), constants.COPYFILE_FICLONE);
		else rmSync(join(work, file), { force: true });
	};
	let written = new Map<string, string>();
	const defines = storybookDefines(work, folder);
	mkdirSync(site, { recursive: true });
	writeFileSync(join(site, 'index.html'), withPageTheme(PAGE));
	let open: BuildContext | null = null;
	return {
		async build(files) {
			const changed = [...new Set([...written.keys(), ...files.keys()])].filter((f) => written.get(f) !== files.get(f));
			for (const file of changed) {
				const text = files.get(file);
				if (text === undefined) putBack(file);
				else {
					mkdirSync(dirname(join(work, file)), { recursive: true });
					writeFileSync(join(work, file), text);
				}
			}
			written = new Map(files);
			stylesheets.changed(changed.flatMap((f) => roots.map((r) => join(r, f))));
			if (open !== null) return settled(async () => (open as BuildContext).rebuild().catch(asErrors));
			await settled(async (missing) => {
				await open?.dispose();
				open = await context(optionsFor(work, folder, site, libraryBuild(packages, stylesheets, missing), defines));
				return open.rebuild().catch(asErrors);
			});
		},
		async dispose() {
			for (const file of written.keys()) putBack(file);
			written = new Map();
			stylesheets.close();
			await open?.dispose();
		},
	};
};

/**
 * A copy of the library at `commit`, taken out of git (its files as committed, which is small: no packages), with the
 * clone's packages linked in: the repository's, and in a monorepo the design system package's own when it has them.
 */
export const copyWithPackages = async (root: string, commit: string, library: string, folder: string): Promise<void> => {
	await exportCommit(root, commit, library);
	// A junction on Windows, a symbolic link elsewhere: the packages are read where the clone has them, by their real path, so
	// a tool held to the clone (the library's PostCSS) never passes through a link on the way to them (macOS's /var).
	for (const at of packageFirst(folder)) {
		const packages = join(root, at, 'node_modules');
		if (existsSync(packages)) symlinkSync(realpathSync(packages), join(library, at, 'node_modules'), 'junction');
	}
};

/** How this file builds a preview, as one fingerprint of its own code: part of what a kept build is kept for (`storyPreviews.ts`). */
export const BUILD_RECIPE = createHash('sha256').update(readFileSync(__filename)).digest('hex');
