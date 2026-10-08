import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { StoryPreview } from '../../shared/contract';
import { readCatalog } from './componentCatalog';
import { developCommit, libraryReads } from './designLibrary';
import { runGit } from './git';
import type { PrototypeServer } from './prototypeServer';

const run = promisify(execFile);

/**
 * Previews of the component library's stories, for the Design System tab (DESIGN_SYSTEM_PLAN.md, P1).
 *
 * **The library's own stories, run as its Storybook runs them,** and nothing written here per component: the stories
 * are the catalog's, each rendered with Storybook's portable stories (`composeStories`) and the library's own
 * `.storybook/preview.tsx`, which wraps every story in the library's `FSApp` and so its theme. Storybook itself is not
 * run; its docs, controls and prop tables stay in Storybook.
 *
 * **One build per `develop` commit,** from a copy of `develop` taken out of git into the app's own folder (the clone's
 * files and branches are never touched), with the clone's installed packages, by the app's own esbuild and Sass. **No npm
 * and no registry login:** a package `develop` added that the clone has not installed makes only the stories that use it
 * say so. It is
 * kept until `develop` moves, and served by the app's local server. A page shows one story file: `?file=<path>`.
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
 */
export const previewEntry = (library: string, storyFiles: string[]): string => `
import { Component, Fragment, createElement as h } from 'react';
import { createRoot } from 'react-dom/client';
import { composeStories, setProjectAnnotations } from '@storybook/react';
import * as preview from ${JSON.stringify(join(library, '.storybook', 'preview'))};

setProjectAnnotations(preview);

const files = {
${storyFiles.map((f) => `\t${JSON.stringify(f)}: () => import(${JSON.stringify(join(library, f))}),`).join('\n')}
};

class Boundary extends Component {
	state = { error: null };
	static getDerivedStateFromError(error) { return { error }; }
	render() { return this.state.error ? h('pre', { className: 'fd-error' }, String(this.state.error?.message ?? this.state.error)) : this.props.children; }
}

const spaced = (name) => name.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
const root = createRoot(document.getElementById('root'));
const fail = (error) => root.render(h('pre', { className: 'fd-error' }, String(error?.message ?? error)));
const tell = () => parent.postMessage({ flockPreviewHeight: Math.ceil(document.documentElement.scrollHeight) }, '*');
new ResizeObserver(tell).observe(document.body);

const load = files[new URLSearchParams(location.search).get('file')];
if (!load) fail('There is no such story file in this build.');
else load().then((m) => {
	const stories = Object.entries(composeStories(m));
	root.render(h(Fragment, null, ...stories.map(([name, Story]) =>
		h('section', { key: name, className: 'fd-story', 'data-story': name },
			h('h4', { className: 'fd-name' }, spaced(name)),
			h(Boundary, null, h(Story))))));
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
const libraryBuild = (nodeModules: string, compileSass: (path: string) => string, missing: ReadonlySet<string>) => ({
	name: 'library',
	setup(b: {
		onResolve: (o: { filter: RegExp }, f: (a: ResolveArgs) => ResolveResult | Promise<ResolveResult | undefined> | undefined) => void;
		onLoad: (o: { filter: RegExp; namespace?: string }, f: (a: { path: string }) => { contents: string; loader: 'css' | 'js' }) => void;
		resolve: (path: string, o: { kind: string; resolveDir: string; importer: string; pluginData: string }) => Promise<{ errors: unknown[]; path: string }>;
	}) {
		b.onResolve({ filter: /^[^./].*\.s?css$/ }, (a) => ({ path: join(nodeModules, a.path) }));
		if (missing.size > 0) {
			b.onResolve({ filter: /.*/ }, async (a) => {
				if (a.pluginData === 'inner' || !missing.has(a.path)) return undefined;
				const found = await b.resolve(a.path, { kind: a.kind, resolveDir: a.resolveDir, importer: a.importer, pluginData: 'inner' });
				return found.errors.length === 0 ? (found as ResolveResult) : { path: a.path, namespace: 'missing' };
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

interface ResolveArgs {
	path: string;
	kind: string;
	resolveDir: string;
	importer: string;
	pluginData?: string;
}
type ResolveResult = { path: string; namespace?: string };
type BuildErrors = { errors: { text: string; location?: { file: string } | null }[] };

/** The specifiers a build could not resolve, from its errors: what `libraryBuild` makes stand-ins for. */
export const unresolved = (errors: { text: string }[]): Set<string> =>
	new Set(errors.map((e) => /Could not resolve "(.+?)"/.exec(e.text)?.[1]).filter((m): m is string => m !== undefined));

/** Builds every story file into `site`, from the copy of the library at `library`. Throws with the build's own words. */
export const buildPreviews = async (library: string, storyFiles: string[], site: string): Promise<void> => {
	const [{ build }, sass] = await Promise.all([import('esbuild'), import('sass')]);
	const nodeModules = join(library, 'node_modules');
	const entry = join(library, 'preview-entry.tsx');
	writeFileSync(entry, previewEntry(library, storyFiles));
	mkdirSync(site, { recursive: true });
	const assets = Object.fromEntries(['.png', '.jpg', '.gif', '.svg', '.woff', '.woff2', '.ttf'].map((e) => [e, 'file' as const]));
	const attempt = (missing: ReadonlySet<string>): Promise<BuildErrors> =>
		build({
			entryPoints: { entry },
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
			plugins: [libraryBuild(nodeModules, (path) => sass.compile(path, { loadPaths: [nodeModules] }).css, missing) as never],
		}).catch((err: Partial<BuildErrors>) => ({ errors: err.errors ?? [{ text: String(err) }] }));
	let result = await attempt(new Set());
	// Only what is not installed here is set aside, and only once: any other error is the build's own and is said as it is.
	if (result.errors.length > 0 && result.errors.every((e) => /Could not resolve/.test(e.text))) result = await attempt(unresolved(result.errors));
	if (result.errors.length > 0) {
		throw new Error(result.errors.slice(0, 5).map((e) => (e.location ? `${e.location.file}: ${e.text}` : e.text)).join('\n'));
	}
	writeFileSync(join(site, 'index.html'), PAGE);
};

/** A copy of the library's `src` and `.storybook` at `commit`, taken out of git, with the clone's packages linked in. */
const copyAt = async (root: string, commit: string, library: string): Promise<void> => {
	mkdirSync(library, { recursive: true });
	const tar = `${library}.tar`;
	await runGit(root, ['archive', '--format=tar', '-o', tar, commit, 'src', '.storybook']);
	await run('tar', ['-xf', tar, '-C', library]);
	rmSync(tar, { force: true });
	// A junction on Windows, a symbolic link elsewhere: the packages are read where the clone has them.
	symlinkSync(join(root, 'node_modules'), join(library, 'node_modules'), 'junction');
};

export interface StoryPreviewsDeps {
	/** The library's clone, or null when none is connected or found. */
	find: () => string | null;
	/** The app's own folder for builds. */
	folder: string;
	server: PrototypeServer;
	/** How the stories are built. Given for tests, to count builds. */
	build?: typeof buildPreviews;
}

/** What the tab asks for. One build per `develop` commit; a second ask while it builds waits for the same one. */
export class StoryPreviews {
	private builds = new Map<string, Promise<StoryPreview>>();

	constructor(private readonly deps: StoryPreviewsDeps) {}

	async preview(): Promise<StoryPreview> {
		const root = this.deps.find();
		if (root === null) return { state: 'no-library' };
		const commit = await developCommit(root);
		if (commit === null) return { state: 'failed', error: 'The library has no develop branch from GitHub to build.' };
		if (!hasPackages(root)) return { state: 'no-packages', root };
		let build = this.builds.get(commit);
		if (build === undefined) {
			build = this.build(root, commit);
			this.builds.set(commit, build);
			// A build that did not work is tried again on the next ask.
			void build.then((b) => b.state !== 'ready' && this.builds.delete(commit));
		}
		return build;
	}

	private async build(root: string, commit: string): Promise<StoryPreview> {
		const dir = join(this.deps.folder, commit);
		const site = join(dir, 'site');
		try {
			if (!existsSync(join(site, 'index.html'))) {
				rmSync(dir, { recursive: true, force: true });
				const library = join(dir, 'library');
				await copyAt(root, commit, library);
				const stories = (await readCatalog(libraryReads(root, commit))).flatMap((c) => c.stories.map((s) => s.file));
				await (this.deps.build ?? buildPreviews)(library, stories, site);
			}
			// Only the build for this commit is kept.
			for (const old of readdirSync(this.deps.folder)) if (old !== commit) rmSync(join(this.deps.folder, old), { recursive: true, force: true });
			return { state: 'ready', base: await this.deps.server.serveFolder(`previews-${commit.slice(0, 12)}`, site) };
		} catch (err) {
			rmSync(dir, { recursive: true, force: true });
			return { state: 'failed', error: err instanceof Error ? err.message : String(err) };
		}
	}
}
