import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { PREVIEW_FILE, PREVIEW_HEIGHT } from '../../shared/catalog';
import type { StoryPreview } from '../../shared/contract';
import type { DesignSystem } from '../../shared/catalog';
import { PREVIEW_CANDIDATES, readCatalog } from './componentCatalog';
import { libraryAt, libraryCommit, libraryReads } from './designLibrary';
import { runGit } from './git';
import type { Plugin } from 'esbuild';
import { ASSET_TYPES, type PrototypeServer } from './prototypeServer';

const run = promisify(execFile);

/**
 * Previews of the component library's stories, for the Design System tab (DESIGN_SYSTEM_PLAN.md, P1).
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
 * The page's script: the story file named in its address, every story in it by name, each in its own error boundary so
 * one that throws does not take the others down. It tells the frame's owner its height, and nothing else.
 *
 * **A story behaves as it does in Storybook, no more.** Portable stories leave out the one part of Storybook's preview
 * that redraws a story when it updates its own args (`useArgs`), so a story wired that way (tabs, selects, drawers in
 * FUI) would not respond; the page supplies just that. A story that pins a value without it does not respond in
 * Storybook either, and does not here: making it respond is the story's to do, in the library.
 */
export const previewEntry = (library: string, storyFiles: string[], { preview, argsChannel }: { preview: string | null; argsChannel: boolean }): string => `
import { Component, Fragment, createElement as h, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { composeStories, setProjectAnnotations } from '@storybook/react';
${preview === null ? '' : `import * as preview from ${JSON.stringify(preview)};
setProjectAnnotations(preview);`}

const files = {
${storyFiles.map((f) => `\t${JSON.stringify(f)}: () => import(${JSON.stringify(join(library, f))}),`).join('\n')}
};

class Boundary extends Component {
	state = { error: null };
	static getDerivedStateFromError(error) { return { error }; }
	render() { return this.state.error ? h('pre', { className: 'fd-error' }, String(this.state.error?.message ?? this.state.error)) : this.props.children; }
}

const argsOf = new Map();
${
	argsChannel
		? `// What Storybook's preview does when a story calls useArgs' updateArgs or resetArgs, which portable stories leave out:
// the story is drawn again with its args as updated. Nothing else, so a story behaves here as it does in Storybook.
import('storybook/preview-api').then(async ({ addons }) => {
	const { RESET_STORY_ARGS, UPDATE_STORY_ARGS } = await import('storybook/internal/core-events');
	addons.getChannel().on(UPDATE_STORY_ARGS, ({ storyId, updatedArgs }) => argsOf.get(storyId)?.((args) => ({ ...args, ...updatedArgs })));
	addons.getChannel().on(RESET_STORY_ARGS, ({ storyId }) => argsOf.get(storyId)?.({}));
});`
		: ''
}
// A story that only sets args, with no render of its own, has a value it sets (a switch's checked, a field's value)
// held by React for good, so a click does nothing. It is given as where the component starts instead, by React's own
// rule for every form control: checked as defaultChecked, value as defaultValue. A story that draws itself is left as
// it is: it holds its own values, as with useArgs.
const STARTING = { checked: 'defaultChecked', value: 'defaultValue' };
const startingValues = (args) => {
	const given = {};
	for (const [key, start] of Object.entries(STARTING)) if (key in args) Object.assign(given, { [key]: undefined, [start]: args[key] });
	return given;
};

const Live = ({ Story, drawsItself }) => {
	const [args, setArgs] = useState({});
	useEffect(() => {
		argsOf.set(Story.id, setArgs);
		return () => argsOf.delete(Story.id);
	}, []);
	return h(Story, { ...(drawsItself ? {} : startingValues(Story.args ?? {})), ...args });
};

const spaced = (name) => name.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
const root = createRoot(document.getElementById('root'));
const fail = (error) => root.render(h('pre', { className: 'fd-error' }, String(error?.message ?? error)));
const tell = () => parent.postMessage({ ${PREVIEW_HEIGHT}: Math.ceil(document.documentElement.scrollHeight) }, '*');
new ResizeObserver(tell).observe(document.body);

const load = files[new URLSearchParams(location.search).get(${JSON.stringify(PREVIEW_FILE)})];
if (!load) fail('There is no such story file in this build.');
else load().then((m) => {
	const stories = Object.entries(composeStories(m));
	const drawsItself = (name) => typeof m[name] === 'function' || typeof m[name]?.render === 'function' || typeof m.default?.render === 'function';
	root.render(h(Fragment, null, ...stories.map(([name, Story]) =>
		h('section', { key: name, className: 'fd-story', 'data-story': name },
			h('h4', { className: 'fd-name' }, spaced(name)),
			h(Boundary, null, h(Live, { Story, drawsItself: drawsItself(name) }))))));
}, fail);
`;

/** Whether the clone has the packages a preview is built from: React, and Storybook's portable stories. */
export const hasPackages = (root: string, exists: (p: string) => boolean = existsSync): boolean =>
	['react', 'react-dom', join('@storybook', 'react')].every((p) => exists(join(root, 'node_modules', p, 'package.json')));

/** What a build step that is not installed here says when a story uses it, in the story's own card. */
export const notInstalled = (what: string): string => `Not installed here: ${what}. Run npm install in the library, then sync.`;

/**
 * What the library's own Storybook set-up gives its build, given here: Sass for the components' `.scss`, a package's
 * stylesheet reached by its path even when its package does not list it (`react-image-gallery`), and nothing for `.mdx`
 * (the docs template `preview.tsx` imports, which a preview does not show).
 *
 * `missing` are imports that could not be resolved in a first build: a package the clone has not installed, or a file the
 * library generates at install time (`symbols.generated`). Each becomes a stand-in that says so when a story reaches for
 * it, so the stories that do not need it still build and render.
 */
const libraryBuild = (nodeModules: string, compileSass: (path: string) => string, missing: ReadonlySet<string>): Plugin => ({
	name: 'library',
	setup(b) {
		b.onResolve({ filter: /^[^./].*\.s?css$/ }, (a) => ({ path: join(nodeModules, a.path) }));
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
		b.onLoad({ filter: /\.scss$/ }, (a) => ({ contents: compileSass(a.path), loader: 'css' }));
	},
});

type BuildErrors = { errors: { text: string; location?: { file: string } | null }[] };

/** The specifiers a build could not resolve, from its errors: what `libraryBuild` makes stand-ins for. */
export const unresolved = (errors: { text: string }[]): Set<string> =>
	new Set(errors.map((e) => /Could not resolve "(.+?)"/.exec(e.text)?.[1]).filter((m): m is string => m !== undefined));

/** Builds every story file into `site`, from the copy of the library at `library`. Throws with the build's own words. */
export const buildPreviews = async (library: string, storyFiles: string[], site: string): Promise<void> => {
	const [{ build }, sass] = await Promise.all([import('esbuild'), import('sass')]);
	const nodeModules = join(library, 'node_modules');
	const entry = join(library, 'preview-entry.tsx');
	const preview = PREVIEW_CANDIDATES.map((p) => join(library, p)).find((f) => existsSync(f)) ?? null;
	// Storybook 9 and later are one package, \`storybook\`, which carries the channel \`useArgs\` speaks on; older ones are not.
	const argsChannel = existsSync(join(nodeModules, 'storybook', 'package.json'));
	writeFileSync(entry, previewEntry(library, storyFiles, { preview, argsChannel }));
	mkdirSync(site, { recursive: true });
	// Fonts and pictures are written as files beside the page: exactly the kinds the server will send.
	const assets = Object.fromEntries(Object.keys(ASSET_TYPES).map((e) => [e, 'file' as const]));
	const attempt = (missing: ReadonlySet<string>): Promise<BuildErrors> =>
		build({
			entryPoints: { entry },
			// Errors name files as the library does (`src/components/…`), not by where the copy is.
			absWorkingDir: library,
			bundle: true,
			splitting: true,
			format: 'esm',
			platform: 'browser',
			jsx: 'automatic',
			minify: true,
			outdir: site,
			loader: assets,
			define: { 'process.env.NODE_ENV': '"production"' },
			logLevel: 'silent',
			plugins: [libraryBuild(nodeModules, (path) => sass.compile(path, { loadPaths: [nodeModules] }).css, missing)],
		}).catch((err: Partial<BuildErrors>) => ({ errors: err.errors ?? [{ text: String(err) }] }));
	let result = await attempt(new Set());
	// Only what is not installed here is set aside, and only once: any other error is the build's own and is said as it is.
	if (result.errors.length > 0 && result.errors.every((e) => /Could not resolve/.test(e.text))) result = await attempt(unresolved(result.errors));
	if (result.errors.length > 0) {
		throw new Error(result.errors.slice(0, 5).map((e) => (e.location ? `${e.location.file}: ${e.text}` : e.text)).join('\n'));
	}
	writeFileSync(join(site, 'index.html'), PAGE);
};

/** A copy of the library at `commit`, taken out of git (its files as committed, which is small: no packages), with the clone's packages linked in. */
const copyAt = async (root: string, commit: string, library: string): Promise<void> => {
	mkdirSync(library, { recursive: true });
	const tar = `${library}.tar`;
	await runGit(root, ['archive', '--format=tar', '-o', tar, commit]);
	await run('tar', ['-xf', tar, '-C', library]);
	rmSync(tar, { force: true });
	// A junction on Windows, a symbolic link elsewhere: the packages are read where the clone has them.
	symlinkSync(join(root, 'node_modules'), join(library, 'node_modules'), 'junction');
};

/** The address a commit's build is served at, under the app's local server. */
const serveKey = (build: string): string => `previews-${build.slice(0, 20)}`;

/**
 * How this app builds a preview, as one short fingerprint: the page, its script and the build's set-up. A build is kept
 * for a commit **and** this, so a newer app never shows a build an older one made from the same commit.
 */
const RECIPE = createHash('sha256').update(`${PAGE}${previewEntry.toString()}${libraryBuild.toString()}`).digest('hex').slice(0, 8);

export interface StoryPreviewsDeps {
	/** The library's clone, or null when none is connected or found. */
	find: () => string | null;
	/** The app's own folder for builds. */
	folder: string;
	server: PrototypeServer;
	/** How the stories are built. Given for tests, to count builds. */
	build?: typeof buildPreviews;
}

/** What the tab asks for. One build per commit of the library's branch; a second ask while it builds waits for the same one. */
export class StoryPreviews {
	/** The build for the commit the branch was last at: only that one is kept, on disk and in the server. */
	private current: { commit: string; build: Promise<StoryPreview> } | null = null;

	constructor(private readonly deps: StoryPreviewsDeps) {}

	async preview(): Promise<StoryPreview> {
		const root = this.deps.find();
		const library = root === null ? null : libraryAt(root);
		if (root === null || library === null) return { state: 'no-library' };
		const commit = await libraryCommit(root, library);
		if (commit === null) return { state: 'failed', error: `The library has no ${library.branch} branch from GitHub to build.` };
		if (!hasPackages(root)) return { state: 'no-packages', root };
		if (this.current?.commit !== commit) {
			const build = this.build(root, library, commit);
			this.current = { commit, build };
			// A build that did not work is tried again on the next ask.
			void build.then((b) => b.state !== 'ready' && this.current?.build === build && (this.current = null));
		}
		return this.current.build;
	}

	private async build(root: string, library: DesignSystem, commit: string): Promise<StoryPreview> {
		const build = `${commit.slice(0, 12)}-${RECIPE}`;
		const dir = join(this.deps.folder, build);
		const site = join(dir, 'site');
		try {
			if (!existsSync(join(site, 'index.html'))) {
				rmSync(dir, { recursive: true, force: true });
				const copy = join(dir, 'library');
				await copyAt(root, commit, copy);
				const stories = (await readCatalog(libraryReads(root, commit), library)).map((c) => c.id);
				await (this.deps.build ?? buildPreviews)(copy, stories, site);
			}
			// Only the build for this commit is kept, and served.
			for (const old of readdirSync(this.deps.folder)) {
				if (old === build) continue;
				this.deps.server.stopServing(serveKey(old));
				rmSync(join(this.deps.folder, old), { recursive: true, force: true });
			}
			return { state: 'ready', base: await this.deps.server.serveFolder(serveKey(build), site) };
		} catch (err) {
			rmSync(dir, { recursive: true, force: true });
			return { state: 'failed', error: err instanceof Error ? err.message : String(err) };
		}
	}
}
