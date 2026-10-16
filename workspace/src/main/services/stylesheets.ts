/**
 * The library's stylesheets as its own Storybook makes them (Phase 5.5 of adjusting a component, DESIGN_SYSTEM.md):
 * Sass for a `.scss`, then the library's own PostCSS configuration when it has one (`postcssProcess.ts`), for every
 * stylesheet the build loads; with neither, a stylesheet is esbuild's to read as it is. Nothing here knows what the
 * library styles with (Tailwind, Panda, a preset): that is its configuration's to say.
 *
 * **Kept until a file it read changes:** a build kept open between changes (`trialBuild`) asks again for every stylesheet
 * on every rebuild, so each is made once, and made again only when a change writes a file it read, by its tools' own
 * account: Sass's list of what it loaded, PostCSS's `dependency` and `dir-dependency` messages (Tailwind's scan of the
 * components for classes). A change to the PostCSS configuration starts its process again.
 */
import { readFileSync, realpathSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Loader, OnLoadResult, PluginBuild } from 'esbuild';
import { postcssConfigIn, postcssRun } from './postcssProcess';
import { errorText } from '../../shared/result';

/**
 * How esbuild reads a stylesheet, as it does one it loads itself: a CSS module (`.module.css`, `.module.scss`) with its class
 * names its own (`local-css`), which the component's code names them by; any other as is.
 */
const cssLoaderOf = (path: string): Loader => (/\.module\.s?css$/.test(path) ? 'local-css' : 'css');

/** A stylesheet made, and the files and folders reading it took. */
interface Made {
	result: OnLoadResult;
	files: Set<string>;
	dirs: string[];
}

export interface Stylesheets {
	/** Loads the build's stylesheets as the library's Storybook makes them. */
	setup(b: PluginBuild): void;
	/** The files (absolute) a change wrote or put back since the last build: what read one is made again. */
	changed(paths: string[]): void;
	close(): void;
}

/** The stylesheets of the copy of the library at `library`, its design system's package at `folder`. */
export const stylesheetsFor = (library: string, folder: string, sass: typeof import('sass')): Stylesheets => {
	const nodeModules = join(library, 'node_modules');
	const config = postcssConfigIn(library, folder);
	let postcss = config === null ? null : postcssRun(library, folder, config);
	// The copy and its configuration as a change names them and as the build does (by their real paths, macOS's /var a link).
	const real = realpathSync(library);
	const configPaths = config === null ? [] : [config, realpathSync(config)];
	const made = new Map<string, Promise<Made>>();
	/** What each stylesheet made read, once it is made: one still being made is made again on any change. */
	const read = new Map<string, Omit<Made, 'result'>>();

	const make = async (path: string): Promise<Made> => {
		const scss = /\.scss$/.test(path);
		const compiled = scss ? sass.compile(path, { loadPaths: [nodeModules] }) : null;
		const files = new Set(compiled?.loadedUrls.filter((u) => u.protocol === 'file:').map((u) => fileURLToPath(u)) ?? []);
		const css = compiled?.css ?? readFileSync(path, 'utf8');
		if (postcss === null) return { result: { contents: css, loader: cssLoaderOf(path) }, files, dirs: [] };
		const processed = await postcss.process(path, css);
		for (const f of processed.files) files.add(f);
		return { result: { contents: processed.css, loader: cssLoaderOf(path) }, files, dirs: processed.dirs };
	};

	return {
		setup(b) {
			b.onLoad({ filter: /\.s?css$/, namespace: 'file' }, async (a) => {
				// A plain stylesheet with no PostCSS to run is read by esbuild as it is.
				if (!/\.scss$/.test(a.path) && postcss === null) return undefined;
				let making = made.get(a.path);
				if (making === undefined) {
					const started = make(a.path);
					made.set(a.path, started);
					started.then(
						(m) => made.get(a.path) === started && read.set(a.path, m),
						() => made.get(a.path) === started && made.delete(a.path),
					);
					making = started;
				}
				// Said as the stylesheet's, by its path in the library, in the tool's own words.
				return making.then(
					(m) => m.result,
					(err: unknown) => ({ errors: [{ text: errorText(err), location: { file: relative(real, a.path) } }] }),
				);
			});
		},
		changed(paths) {
			if (paths.length === 0) return;
			if (paths.some((p) => configPaths.includes(p))) {
				postcss?.close();
				postcss = postcssRun(library, folder, configPaths[0] as string);
				made.clear();
				read.clear();
				return;
			}
			const under = (dir: string, p: string) => p.startsWith(dir.endsWith(sep) ? dir : dir + sep);
			for (const path of made.keys()) {
				const r = read.get(path);
				if (r && !paths.some((p) => p === path || r.files.has(p) || r.dirs.some((d) => under(d, p)))) continue;
				made.delete(path);
				read.delete(path);
			}
		},
		close() {
			postcss?.close();
		},
	};
};
