/**
 * Each stylesheet is kept until a file it read changes (by Sass's loaded files and PostCSS's dependency messages), since a
 * kept-open build asks for every stylesheet again on each rebuild.
 */
import { readFileSync, realpathSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Loader, OnLoadResult, PluginBuild } from 'esbuild';
import { postcssConfigIn, postcssRun } from './postcssProcess';
import { errorText } from '../../../shared/result';

/** A CSS module needs `local-css`, so its class names are the ones the component's code imports. */
const cssLoaderOf = (path: string): Loader => (/\.module\.s?css$/.test(path) ? 'local-css' : 'css');

interface Made {
	result: OnLoadResult;
	files: Set<string>;
	dirs: string[];
}

export interface Stylesheets {
	setup(b: PluginBuild): void;
	/** Absolute paths. */
	changed(paths: string[]): void;
	close(): void;
}

export const stylesheetsFor = (library: string, folder: string, sass: typeof import('sass')): Stylesheets => {
	const nodeModules = join(library, 'node_modules');
	const config = postcssConfigIn(library, folder);
	let postcss = config === null ? null : postcssRun(library, folder, config);
	// The copy and its configuration as a change names them and as the build does (by their real paths, macOS's /var a link).
	const real = realpathSync(library);
	const configPaths = config === null ? [] : [config, realpathSync(config)];
	const made = new Map<string, Promise<Made>>();
	/** Set once a stylesheet is made: one still being made has no entry, so it is made again on any change. */
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
