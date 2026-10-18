import { createHash } from 'node:crypto';
import {
	constants,
	copyFileSync,
	cpSync,
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	realpathSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename, dirname, join, relative, sep } from 'node:path';
import PREVIEW_PAGE from '../../page/preview?page';
import { designSystemOf } from '../../shared/catalog';
import type { ConnectedDesignSystem, StoryPreview, TokenEdit } from '../../shared/contract';
import { type CatalogReads, readCatalog } from './componentCatalog';
import { packageFirst, packagesOf, previewSetup, storybookDefines } from './storybookSetup';
import { type LibraryAt, baseAt, inLibrary, systemReads } from './designLibrary';
import { exportCommit } from './git';
import type { BuildContext, BuildOptions, Plugin } from 'esbuild';
import { ASSET_TYPES, type PrototypeServer } from './prototypeServer';
import { editedFiles } from './tokenEdits';
import { errorText } from '../../shared/result';
import { heldTurns, singleFlight } from './concurrency';
import { type Stylesheets, stylesheetsFor } from './stylesheets';
import { withPageTheme } from './pageTheme';
import { HOST } from '../../shared/vocabulary';

/**
 * Previews of the component library's stories, for the Design System tab (DESIGN_SYSTEM.md, P1).
 *
 * **The library's own stories, run as its Storybook runs them,** and nothing written here per component: the stories
 * are the catalog's, each rendered with Storybook's portable stories (`composeStories`) and the library's own
 * `.storybook/preview` when it has one (FUI's wraps every story in its `FSApp`, and so its theme). Storybook itself is
 * not run; its docs, controls and prop tables stay in Storybook.
 *
 * **One build per commit of the library's branch,** from a copy of it taken out of git into the app's own folder (the
 * clone's files and branches are never touched), with the clone's installed packages, by the app's own esbuild and Sass.
 * **No npm and no registry login:** a package the branch added that the clone has not installed makes only the stories
 * that use it say so. It is kept until the branch moves, and served by the app's local server. A page shows one story
 * file: `?file=<path>`.
 */

/** The page every preview frame loads. Plain styles of its own: the stories bring the library's. */
const PAGE = `<!doctype html>
<html>
	<head>
		<meta charset="utf-8" />
		<link rel="stylesheet" href="./entry.css" />
		<style>
			body { margin: 0; padding: 16px; background: #fff; }
			.fd-story { margin: 0 0 24px; }
			.fd-story:last-child { margin-bottom: 0; }
			.fd-name { margin: 0 0 8px; font: 500 12px/1.4 -apple-system, system-ui, sans-serif; color: #6b7280; }
			.fd-error { margin: 0; color: #b91c1c; white-space: pre-wrap; font: 12px/1.4 ui-monospace, monospace; }
		</style>
	</head>
	<body>
		<div id="root"></div>
		<script type="module" src="./entry.js"></script>
	</body>
</html>
`;

/**
 * The page's entry, generated for the library: only what must be its own, its React, its Storybook, its preview set-up and
 * its story files, imported where the library has them and handed to the page's own code (`page/preview.ts`, bundled in as
 * text), which draws the story file named in its address, every story in it by name, each in its own error boundary so one
 * that throws does not take the others down. It tells the frame's owner its height, and nothing else; and hears from it
 * only the values to try on the component's instances.
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
 * What the library's own Storybook set-up gives its build, given here: its stylesheets as it makes them (`stylesheets.ts`:
 * Sass, then its own PostCSS), a package's stylesheet reached by its path even when its package does not list it
 * (`react-image-gallery`), and nothing for `.mdx` (the docs template `preview.tsx` imports, which a preview does not show).
 *
 * `missing` are imports that could not be resolved in a first build: a package the clone has not installed, or a file the
 * library generates at install time (`symbols.generated`). Each becomes a stand-in that says so when a story reaches for
 * it, so the stories that do not need it still build and render.
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

/**
 * What the preview page is built with, from a copy of the library at `library` into `site`, with the globals the library's
 * own Storybook build defines (`storybookDefines`) and the production build of React's.
 */
const ENTRY = 'preview-entry.tsx';
/** The packages a copy's design system builds with that are installed, its package's first: what a stylesheet is found in. */
const installedPackages = (library: string, folder: string): string[] => packagesOf(library, folder).filter((p) => existsSync(p));
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
	// Storybook 8 and later have the \`storybook\` package, which carries its preview's channel; older ones do not.
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
 * The previews built again with a change (to the tokens, T3, decision 26; to where a value is written, Phase 4) in `work`,
 * a copy of its own of the commit's copy (`copy`), so a change's files are on disk where every tool reads the library from
 * (Tailwind's scan of its classes, Sass's imports of a partial, Phase 5.5) and no other build sees them. Each build writes the
 * files it is given and puts back the ones the last wrote, as the commit has them; closing puts back the last. **Kept open
 * between changes,** so each is esbuild's incremental rebuild, about a second for the real library, and a stylesheet no change
 * touches is made once (`stylesheets.ts`).
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
const copyWithPackages = async (root: string, commit: string, library: string, folder: string): Promise<void> => {
	await exportCommit(root, commit, library);
	// A junction on Windows, a symbolic link elsewhere: the packages are read where the clone has them, by their real path, so
	// a tool held to the clone (the library's PostCSS) never passes through a link on the way to them (macOS's /var).
	for (const at of packageFirst(folder)) {
		const packages = join(root, at, 'node_modules');
		if (existsSync(packages)) symlinkSync(realpathSync(packages), join(library, at, 'node_modules'), 'junction');
	}
};

/** A build runs the library's code: served on the pages' address, never the review bar's (the README's Review isolation). */
const CODE = { code: true };

/** The address a commit's build is served at, under the app's local server. */
const serveKey = (build: string): string => `previews-${build.slice(0, 26)}`;

/**
 * How this app builds a preview, as one short fingerprint: the app's own code as it was built (the extension is one file),
 * so whatever in it changes how a preview is made (the page, its script, the stylesheets' step, the set-up read), a newer
 * app never shows a build an older one made from the same commit. A build is kept for a commit **and** this.
 */
const RECIPE = createHash('sha256').update(readFileSync(__filename)).digest('hex').slice(0, 8);

/** The address a build of a commit's copy is served at: what it is for, and how many times, so each is at one of its own. */
const servedAt = (what: string, times: number, dir: string): string => `${what}-${times}-${basename(dir).slice(0, 12)}`;

/**
 * What a build of the commit's previews with a change is for: T6's tags, what a change being tried reaches, finding where
 * a value of a component's own is written, and what writing it there reaches (Phase 4).
 */
export type BuiltFor = 'tagged' | 'reach' | 'locate' | 'written';

/** A build kept open for one purpose (`StoryPreviews.opened`). */
export interface OpenedBuild {
	state: 'open';
	reads: CatalogReads;
	/** Built with `files` (path to text) in place of the library's own; the address it is served at. */
	build(files: Map<string, string>): Promise<string>;
	close(): Promise<void>;
}

export interface StoryPreviewsDeps {
	/** The design system shown, or null when none is connected or its clone is gone. */
	system: () => ConnectedDesignSystem | null;
	/** The app's own folder for builds. */
	folder: string;
	server: PrototypeServer;
	/** How the stories are built. Given for tests, to count builds. */
	build?: typeof buildPreviews;
	/** The commit the tab reads (`LibraryShown`): the library's own branch unless another is shown. */
	at?: LibraryAt;
}

/** The build for one commit of one design system: what a change is tried on. */
interface Built {
	key: string;
	build: Promise<StoryPreview>;
	dir: string;
	/** The design system's package in the repository, in a monorepo; '' for the repository itself. */
	folder: string;
	/** The design system's files at the commit, each read once: a commit's files never change, and a change reads them all. */
	reads: () => Promise<CatalogReads>;
}

/** Reads whose every answer is kept: for a commit, whose files never change. */
const keptReads = (reads: CatalogReads): CatalogReads => {
	const lists = new Map<string, Promise<string[]>>();
	const files = new Map<string, Promise<string>>();
	const kept = <T>(m: Map<string, Promise<T>>, k: string, read: () => Promise<T>): Promise<T> => {
		if (!m.has(k))
			m.set(
				k,
				read().catch((err) => (m.delete(k), Promise.reject(err))),
			);
		return m.get(k) as Promise<T>;
	};
	return { listFiles: (dir) => kept(lists, dir, () => reads.listFiles(dir)), readFile: (path) => kept(files, path, () => reads.readFile(path)) };
};

/**
 * What the tab asks for. One build per commit of the library's branch; a second ask while it builds waits for the same one.
 * **A change is tried on that build** (T3): built again with the change, served at an address of its own each time so
 * every frame showing it loads it afresh, and only the newest change asked for is built, however many come while one
 * builds. Leaving a change is asking with none: the commit's own build, which a change never touches.
 */
export class StoryPreviews {
	/** The build for the commit the branch was last at: only that one is kept, on disk and in the server. */
	private current: Built | null = null;
	/** The build a change is tried on, open between changes, and the address it was last served at. */
	private trial: { dir: string; builder: TrialBuild; served: string | null; tries: number } | null = null;
	/** The newest change asked for, and the building of it, while one is building. */
	private wanted: TokenEdit[] = [];
	private trying = singleFlight<'newest', StoryPreview>();
	/**
	 * The address each of the commit's builds with a change was last served at, by what it is for: the tags T6 draws with,
	 * and what a change being tried reaches (Phase 3 of adjusting a component). How many each has been built, so each build
	 * is at an address of its own and a page never reads an older one from its cache.
	 */
	private builtServed = new Map<BuiltFor, { dir: string; key: string; builds: number }>();
	/** One build open for each purpose at a time, since each builds in a copy of its own (`builderFor`). */
	private readonly ownCopy = heldTurns<BuiltFor>();
	/** The copies made in this run of the app: one an earlier run left may have a change still written in it. */
	private readonly fresh = new Set<string>();

	constructor(private readonly deps: StoryPreviewsDeps) {}

	async preview(edits: TokenEdit[] = []): Promise<StoryPreview> {
		const base = await this.base();
		if (edits.length === 0 || base.state !== 'ready') return base;
		// A branch handed to Claude Code is shown as it was committed: what is tried waits for the library's own branch.
		if (await this.showing()) return base;
		this.wanted = edits;
		return this.trying.run('newest', () => this.tryNewest());
	}

	/** Whether a branch handed to Claude Code is shown in place of the library's (`LibraryShown`). */
	private async showing(): Promise<boolean> {
		const system = this.deps.system();
		return system !== null && ((await (this.deps.at ?? baseAt)(system))?.showing ?? null) !== null;
	}

	private async base(): Promise<StoryPreview> {
		const system = this.deps.system();
		if (system === null) return { state: 'no-library' };
		const { root, branch, folder } = system;
		const commit = (await (this.deps.at ?? baseAt)(system))?.commit ?? null;
		if (commit === null) return { state: 'failed', error: `The library has no ${branch} branch from ${HOST} to build.` };
		// The packages are the repository's, or in a monorepo the design system package's own.
		if (!hasPackages(root) && !(folder !== '' && hasPackages(join(root, folder)))) return { state: 'no-packages', root };
		// A build is of one design system at one commit: two packages of one repository are two builds.
		const key = `${commit}:${folder}`;
		if (this.current?.key !== key) {
			const dir = join(this.deps.folder, `${commit.slice(0, 12)}-${createHash('sha256').update(folder).digest('hex').slice(0, 4)}-${RECIPE}`);
			// Read when first needed: a build already on disk, and no change tried, needs none.
			let reading: Promise<CatalogReads> | null = null;
			const reads = () => (reading ??= systemReads(system, commit).then(keptReads));
			const build = this.build(system, commit, dir, reads);
			this.current = { key, build, dir, folder, reads };
			// A build that did not work is tried again on the next ask.
			void build.then((b) => b.state !== 'ready' && this.current?.build === build && (this.current = null));
		}
		return this.current.build;
	}

	private async build(system: ConnectedDesignSystem, commit: string, dir: string, reads: () => Promise<CatalogReads>): Promise<StoryPreview> {
		const site = join(dir, 'site');
		try {
			if (!existsSync(join(site, 'index.html'))) {
				rmSync(dir, { recursive: true, force: true });
				const copy = join(dir, 'library');
				await copyWithPackages(system.root, commit, copy, system.folder);
				const stories = (await readCatalog(await reads(), designSystemOf(system))).map((c) => c.id);
				await (this.deps.build ?? buildPreviews)(copy, stories, site, system.folder);
			}
			// Only the build for this commit is kept, and served; a change tried on another is closed with it. Only by the build
			// still asked for: one another design system's build has passed while it built leaves that one's alone.
			if (this.current?.dir !== dir) return { state: 'ready', base: await this.deps.server.serveFolder(serveKey(basename(dir)), site, CODE) };
			if (this.trial !== null && this.trial.dir !== dir) await this.endTrial();
			for (const [purpose, served] of this.builtServed) {
				if (served.dir === dir) continue;
				this.deps.server.stopServing(served.key);
				this.builtServed.delete(purpose);
			}
			for (const old of readdirSync(this.deps.folder)) {
				if (old === basename(dir)) continue;
				this.deps.server.stopServing(serveKey(old));
				rmSync(join(this.deps.folder, old), { recursive: true, force: true });
			}
			return { state: 'ready', base: await this.deps.server.serveFolder(serveKey(basename(dir)), site, CODE) };
		} catch (err) {
			rmSync(dir, { recursive: true, force: true });
			return { state: 'failed', error: errorText(err) };
		}
	}

	/** Builds the newest change asked for until none newer is waiting, and answers with that one's build. */
	private async tryNewest(): Promise<StoryPreview> {
		let built: TokenEdit[] | null = null;
		let answer: StoryPreview = { state: 'no-library' };
		while (built !== this.wanted) {
			built = this.wanted;
			answer = await this.tryChange(built);
		}
		return answer;
	}

	private async tryChange(edits: TokenEdit[]): Promise<StoryPreview> {
		const at = this.current;
		if (at === null) return { state: 'no-library' };
		try {
			const files = await editedFiles(await at.reads(), edits);
			if (this.trial?.dir !== at.dir) {
				await this.endTrial();
				this.trial = { dir: at.dir, builder: await this.builderFor(at, 'trial'), served: null, tries: 0 };
			}
			const trial = this.trial;
			await trial.builder.build(files);
			// A new address for each, so a frame showing the last one loads this one.
			const key = servedAt('trial', ++trial.tries, at.dir);
			const base = await this.deps.server.serveFolder(key, join(at.dir, 'trial'), CODE);
			if (trial.served !== null) this.deps.server.stopServing(trial.served);
			trial.served = key;
			return { state: 'ready', base };
		} catch (err) {
			return { state: 'failed', error: errorText(err) };
		}
	}

	/**
	 * A build of the commit's previews kept open for `purpose`, built again with each set of files given in place of the
	 * library's own (`build`, which answers with the address that build is served at), until it is closed: beside the change
	 * being tried in the frame, which is the person's, never in its place, so a frame showing it is never pulled from under
	 * it. With the commit's files as read (`reads`), which a change is made from. Only the last build of each is served.
	 */
	async opened(purpose: BuiltFor): Promise<OpenedBuild | Exclude<StoryPreview, { state: 'ready' }>> {
		// Its turn, held until it is closed: a second asked for meanwhile waits for it.
		const closed = await this.ownCopy(purpose);
		try {
			const base = await this.base();
			const at = this.current;
			if (base.state !== 'ready' || at === null) {
				closed();
				return base.state !== 'ready' ? base : { state: 'no-library' };
			}
			const [listed, builder] = await Promise.all([at.reads(), this.builderFor(at, purpose)]);
			// The design system's files as git lists them; their text from the copy the builds are made from, which is the commit's.
			const copy = join(at.dir, 'library');
			const reads: CatalogReads = {
				listFiles: (dir) => listed.listFiles(dir),
				readFile: async (path) => readFile(join(copy, inLibrary(path)), 'utf8'),
			};
			return {
				state: 'open',
				reads,
				build: async (files) => {
					await builder.build(files);
					const last = this.builtServed.get(purpose);
					const builds = (last?.builds ?? 0) + 1;
					const key = servedAt(purpose, builds, at.dir);
					if (last) this.deps.server.stopServing(last.key);
					this.builtServed.set(purpose, { dir: at.dir, key, builds });
					return this.deps.server.serveFolder(key, join(at.dir, purpose), CODE);
				},
				close: () => builder.dispose().finally(closed),
			};
		} catch (err) {
			closed();
			throw err;
		}
	}

	/**
	 * The commit's previews built once, for `purpose`, with the files a change writes, made from the commit's (`files`: a
	 * token change's, `editedFiles`; where a value is written): `opened`, built and closed.
	 */
	async builtWith(purpose: BuiltFor, files: (reads: CatalogReads) => Promise<Map<string, string>>): Promise<StoryPreview> {
		const opened = await this.opened(purpose);
		if (opened.state !== 'open') return opened;
		try {
			return { state: 'ready', base: await opened.build(await files(opened.reads)) };
		} catch (err) {
			return { state: 'failed', error: errorText(err) };
		} finally {
			await opened.close();
		}
	}

	/** The copy of the commit the previews are built from, on disk, with its packages: what its types are read from (Phase 5). */
	async copy(): Promise<string | Exclude<StoryPreview, { state: 'ready' }>> {
		const base = await this.base();
		if (base.state !== 'ready') return base;
		return this.current === null ? { state: 'no-library' } : join(this.current.dir, 'library');
	}

	/**
	 * A build of the commit's copy with files given in place of its own, into `site` beside the commit's own build, in a copy
	 * of its own for `site` (`trialBuild`), kept for the commit and made again on its first use in this run of the app.
	 */
	private builderFor(at: Built, site: string): Promise<TrialBuild> {
		const work = join(at.dir, `${site}-library`);
		if (!this.fresh.has(work)) {
			rmSync(work, { recursive: true, force: true });
			this.fresh.add(work);
		}
		return trialBuild(join(at.dir, 'library'), work, join(at.dir, site), at.folder);
	}

	private async endTrial(): Promise<void> {
		const trial = this.trial;
		this.trial = null;
		if (trial === null) return;
		if (trial.served !== null) this.deps.server.stopServing(trial.served);
		await trial.builder.dispose();
	}
}
