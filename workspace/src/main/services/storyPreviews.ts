import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { PREVIEW_FILE, PREVIEW_HEIGHT } from '../../shared/catalog';
import { designSystemOf } from '../../shared/catalog';
import type { ConnectedDesignSystem, StoryPreview, TokenEdit } from '../../shared/contract';
import { type CatalogReads, PREVIEW_CANDIDATES, readCatalog } from './componentCatalog';
import { libraryCommit, systemReads } from './designLibrary';
import { readTokens } from './designTokens';
import { runGit } from './git';
import type { BuildContext, BuildOptions, Loader, Plugin } from 'esbuild';
import { ASSET_TYPES, type PrototypeServer } from './prototypeServer';
import { editedFiles } from './tokenEdits';

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
// A story that only sets args, with no render of its own, and sets \`checked\` (a switch, a checkbox) has it held by React
// for good, so a click does nothing. It is given as where the control starts instead, by React's own rule for a checkable
// control: \`defaultChecked\`. Only \`checked\`, which means one thing: \`value\` is also what a label shows (FUI's
// PopoverLineItem), so it is left alone. A story that draws itself holds its own values, as with useArgs.
const startingValues = (args) => ('checked' in args ? { checked: undefined, defaultChecked: args.checked } : {});

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
 *
 * `edited` are the library's token files as a change has them (T3): each is built from that text in place of its file,
 * so a change is tried without a file of the copy written, and leaving it is building with none.
 */
const libraryBuild = (nodeModules: string, compileSass: CompileSass, missing: ReadonlySet<string>, edited?: Edited): Plugin => ({
	name: 'library',
	setup(b) {
		if (edited && edited.files.length > 0) {
			b.onLoad({ filter: new RegExp(`^(?:${edited.files.map(escapedForRegExp).join('|')})$`) }, (a) => {
				const text = edited.text(a.path);
				if (text === undefined) return undefined;
				return /\.scss$/.test(a.path) ? { contents: compileSass(a.path, text), loader: 'css' } : { contents: text, loader: loaderOf(a.path) };
			});
		}
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

/** Sass for a file, from the file or, when a change has it, from `text`. */
type CompileSass = (path: string, text?: string) => string;

/** The token files a change was written into, by absolute path, and the text a change gives each, if any. */
interface Edited {
	files: string[];
	text: (path: string) => string | undefined;
}

const escapedForRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** How esbuild reads a file a change gives the text of, by its extension. */
const loaderOf = (path: string): Loader => (({ '.ts': 'ts', '.tsx': 'tsx', '.jsx': 'jsx', '.css': 'css', '.json': 'json' }) as Record<string, Loader>)[extname(path)] ?? 'js';

/** The library's Sass, compiled as its own Storybook set-up compiles it, with its packages to import from. */
const sassFor = (sass: typeof import('sass'), nodeModules: string): CompileSass => (path, text) =>
	text === undefined
		? sass.compile(path, { loadPaths: [nodeModules] }).css
		: sass.compileString(text, { loadPaths: [dirname(path), nodeModules], url: pathToFileURL(path) }).css;

type BuildErrors = { errors: { text: string; location?: { file: string } | null }[] };

/** A build's failure as its errors, as a build that worked has none. */
const asErrors = (err: Partial<BuildErrors>): BuildErrors => ({ errors: err.errors ?? [{ text: String(err) }] });

/** What the preview page is built with, from a copy of the library at `library` into `site`. */
const ENTRY = 'preview-entry.tsx';
const optionsFor = (library: string, site: string, plugin: Plugin): BuildOptions => ({
	entryPoints: { entry: join(library, ENTRY) },
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
	define: { 'process.env.NODE_ENV': '"production"' },
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
		throw new Error(result.errors.slice(0, 5).map((e) => (e.location ? `${e.location.file}: ${e.text}` : e.text)).join('\n'));
	}
};

/** The specifiers a build could not resolve, from its errors: what `libraryBuild` makes stand-ins for. */
export const unresolved = (errors: { text: string }[]): Set<string> =>
	new Set(errors.map((e) => /Could not resolve "(.+?)"/.exec(e.text)?.[1]).filter((m): m is string => m !== undefined));

/** Builds every story file into `site`, from the copy of the library at `library`. Throws with the build's own words. */
export const buildPreviews = async (library: string, storyFiles: string[], site: string): Promise<void> => {
	const [{ build }, sass] = await Promise.all([import('esbuild'), import('sass')]);
	const nodeModules = join(library, 'node_modules');
	const preview = PREVIEW_CANDIDATES.map((p) => join(library, p)).find((f) => existsSync(f)) ?? null;
	// Storybook 9 and later are one package, \`storybook\`, which carries the channel \`useArgs\` speaks on; older ones are not.
	const argsChannel = existsSync(join(nodeModules, 'storybook', 'package.json'));
	writeFileSync(join(library, ENTRY), previewEntry(library, storyFiles, { preview, argsChannel }));
	mkdirSync(site, { recursive: true });
	const compileSass = sassFor(sass, nodeModules);
	await settled((missing) => build(optionsFor(library, site, libraryBuild(nodeModules, compileSass, missing))).catch(asErrors));
	writeFileSync(join(site, 'index.html'), PAGE);
};

/** The previews built again with a change: built with a change's files, as often as the change changes; closed when done. */
export interface TrialBuild {
	build(files: Map<string, string>): Promise<void>;
	dispose(): Promise<void>;
}

/**
 * The previews built again with a change to the tokens (T3, decision 26), from the copy the first build was made from:
 * the token files the change writes are built from its text in place of theirs (`libraryBuild`), so nothing in the copy
 * is written and nothing is left to undo. **Kept open between changes,** so each is esbuild's incremental rebuild, about a
 * second for the real library, and the Sass, which a change to a theme file does not touch, compiled once.
 */
export const trialBuild = async (library: string, tokenFiles: string[], site: string): Promise<TrialBuild> => {
	const [{ context }, sass] = await Promise.all([import('esbuild'), import('sass')]);
	const nodeModules = join(library, 'node_modules');
	// esbuild names a file by its real path, and a temporary folder can be reached through a link (macOS's /var).
	const roots = [...new Set([library, realpathSync(library)])];
	let texts = new Map<string, string>();
	const edited: Edited = { files: tokenFiles.flatMap((f) => roots.map((r) => join(r, f))), text: (path) => texts.get(path) };
	const plain = sassFor(sass, nodeModules);
	const compiled = new Map<string, string>();
	const compileSass: CompileSass = (path, text) => {
		if (text !== undefined) return plain(path, text);
		if (!compiled.has(path)) compiled.set(path, plain(path));
		return compiled.get(path) as string;
	};
	mkdirSync(site, { recursive: true });
	writeFileSync(join(site, 'index.html'), PAGE);
	let open: BuildContext | null = null;
	return {
		async build(files) {
			texts = new Map([...files].flatMap(([f, text]) => roots.map((r) => [join(r, f), text] as const)));
			if (open !== null) return settled(async () => (open as BuildContext).rebuild().catch(asErrors));
			await settled(async (missing) => {
				await open?.dispose();
				open = await context(optionsFor(library, site, libraryBuild(nodeModules, compileSass, missing, edited)));
				return open.rebuild().catch(asErrors);
			});
		},
		dispose: async () => open?.dispose(),
	};
};

/**
 * A copy of the library at `commit`, taken out of git (its files as committed, which is small: no packages), with the
 * clone's packages linked in: the repository's, and in a monorepo the design system package's own when it has them.
 */
const copyAt = async (root: string, commit: string, library: string, folder: string): Promise<void> => {
	mkdirSync(library, { recursive: true });
	const tar = `${library}.tar`;
	await runGit(root, ['archive', '--format=tar', '-o', tar, commit]);
	await run('tar', ['-xf', tar, '-C', library]);
	rmSync(tar, { force: true });
	// A junction on Windows, a symbolic link elsewhere: the packages are read where the clone has them.
	for (const at of folder === '' ? [''] : ['', folder]) {
		if (existsSync(join(root, at, 'node_modules'))) symlinkSync(join(root, at, 'node_modules'), join(library, at, 'node_modules'), 'junction');
	}
};

/** The address a commit's build is served at, under the app's local server. */
const serveKey = (build: string): string => `previews-${build.slice(0, 26)}`;

/**
 * How this app builds a preview, as one short fingerprint: the page, its script and the build's set-up. A build is kept
 * for a commit **and** this, so a newer app never shows a build an older one made from the same commit.
 */
const RECIPE = createHash('sha256').update(`${PAGE}${previewEntry.toString()}${libraryBuild.toString()}`).digest('hex').slice(0, 8);

export interface StoryPreviewsDeps {
	/** The design system shown, or null when none is connected or its clone is gone. */
	system: () => ConnectedDesignSystem | null;
	/** The app's own folder for builds. */
	folder: string;
	server: PrototypeServer;
	/** How the stories are built. Given for tests, to count builds. */
	build?: typeof buildPreviews;
}

/** The build for one commit of one design system: what a change is tried on. */
interface Built {
	key: string;
	build: Promise<StoryPreview>;
	system: ConnectedDesignSystem;
	commit: string;
	dir: string;
	/** The design system's files at the commit, each read once: a commit's files never change, and a change reads them all. */
	reads: () => Promise<CatalogReads>;
}

/** Reads whose every answer is kept: for a commit, whose files never change. */
const keptReads = (reads: CatalogReads): CatalogReads => {
	const lists = new Map<string, Promise<string[]>>();
	const files = new Map<string, Promise<string>>();
	const kept = <T>(m: Map<string, Promise<T>>, k: string, read: () => Promise<T>): Promise<T> => {
		if (!m.has(k)) m.set(k, read().catch((err) => (m.delete(k), Promise.reject(err))));
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
	private trying: Promise<StoryPreview> | null = null;

	constructor(private readonly deps: StoryPreviewsDeps) {}

	async preview(edits: TokenEdit[] = []): Promise<StoryPreview> {
		const base = await this.base();
		if (edits.length === 0 || base.state !== 'ready') return base;
		this.wanted = edits;
		this.trying ??= this.tryNewest().finally(() => (this.trying = null));
		return this.trying;
	}

	private async base(): Promise<StoryPreview> {
		const system = this.deps.system();
		if (system === null) return { state: 'no-library' };
		const { root, branch, folder } = system;
		const commit = await libraryCommit(root, branch);
		if (commit === null) return { state: 'failed', error: `The library has no ${branch} branch from GitHub to build.` };
		// The packages are the repository's, or in a monorepo the design system package's own.
		if (!hasPackages(root) && !(folder !== '' && hasPackages(join(root, folder)))) return { state: 'no-packages', root };
		// A build is of one design system at one commit: two packages of one repository are two builds.
		const key = `${commit}:${folder}`;
		if (this.current?.key !== key) {
			const dir = join(this.deps.folder, `${commit.slice(0, 12)}-${createHash('sha256').update(folder).digest('hex').slice(0, 4)}-${RECIPE}`);
			const build = this.build(system, commit, dir);
			let reads: Promise<CatalogReads> | null = null;
			this.current = { key, build, system, commit, dir, reads: () => (reads ??= systemReads(system, commit).then(keptReads)) };
			// A build that did not work is tried again on the next ask.
			void build.then((b) => b.state !== 'ready' && this.current?.build === build && (this.current = null));
		}
		return this.current.build;
	}

	private async build(system: ConnectedDesignSystem, commit: string, dir: string): Promise<StoryPreview> {
		const site = join(dir, 'site');
		try {
			if (!existsSync(join(site, 'index.html'))) {
				rmSync(dir, { recursive: true, force: true });
				const copy = join(dir, 'library');
				await copyAt(system.root, commit, copy, system.folder);
				const stories = (await readCatalog(await systemReads(system, commit), designSystemOf(system))).map((c) => c.id);
				await (this.deps.build ?? buildPreviews)(copy, stories, site);
			}
			// Only the build for this commit is kept, and served; a change tried on another is closed with it.
			if (this.trial !== null && this.trial.dir !== dir) await this.endTrial();
			for (const old of readdirSync(this.deps.folder)) {
				if (old === basename(dir)) continue;
				this.deps.server.stopServing(serveKey(old));
				rmSync(join(this.deps.folder, old), { recursive: true, force: true });
			}
			return { state: 'ready', base: await this.deps.server.serveFolder(serveKey(basename(dir)), site) };
		} catch (err) {
			rmSync(dir, { recursive: true, force: true });
			return { state: 'failed', error: err instanceof Error ? err.message : String(err) };
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
			const reads = await at.reads();
			const files = await editedFiles(reads, edits);
			if (this.trial?.dir !== at.dir) {
				await this.endTrial();
				const tokenFiles = [...new Set((await readTokens(reads)).tokens.map((t) => t.source.file))];
				this.trial = { dir: at.dir, builder: await trialBuild(join(at.dir, 'library'), tokenFiles, join(at.dir, 'trial')), served: null, tries: 0 };
			}
			const trial = this.trial;
			await trial.builder.build(files);
			// A new address for each, so a frame showing the last one loads this one.
			const key = `trial-${++trial.tries}-${basename(at.dir).slice(0, 12)}`;
			const base = await this.deps.server.serveFolder(key, join(at.dir, 'trial'));
			if (trial.served !== null) this.deps.server.stopServing(trial.served);
			trial.served = key;
			return { state: 'ready', base };
		} catch (err) {
			return { state: 'failed', error: err instanceof Error ? err.message : String(err) };
		}
	}

	private async endTrial(): Promise<void> {
		const trial = this.trial;
		this.trial = null;
		if (trial === null) return;
		if (trial.served !== null) this.deps.server.stopServing(trial.served);
		await trial.builder.dispose();
	}
}
