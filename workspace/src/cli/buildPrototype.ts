/**
 * Bundled whole and written beside the prototypes (`writeBundleScript`), so the app's save and the agent's own build run the
 * same script, and "it built for the agent" and "it builds when saved" are the same fact. esbuild and Sass are given by
 * path: they are the app's own, never bundled into this.
 *
 * `node build-prototype.mjs <esbuild> <entry> <out> <node_modules> <shared> [--from <design system> <package> <sass>]`
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { STATE_NAME, STATES_META } from '../shared/prototypeStates';
import { fromSource } from '../core/services/prototypes/fromSource';

const [, , esbuildPath = '', entry = '', out = '', nodeModules = '', shared = '', flag, designSystem, pkg, sassPath] = process.argv;
const { build } = (await import(pathToFileURL(esbuildPath).href)) as typeof import('esbuild');
const source = readFileSync(entry, 'utf8');
// The comment the page opens with (what it shows, where it sits, its gaps) travels into the HTML for reviewers.
const lead =
	/^\s*\/\*([\s\S]*?)\*\//
		.exec(source)?.[1]
		?.replace(/^\s*\* ?/gm, '')
		.trim() ?? '';
// The states it says it has (export const states = ['default', ...], the first what it opens in) go into the page as a
// tag, for the bar to offer. Read from the source as written, not run: a list that is not plain names fails the build.
let states: string[] = [];
if (/^export const states\b/m.test(source)) {
	const list = /^export const states\b[^=\n]*=\s*\[([^\]]*)\]/m.exec(source);
	states = (list?.[1] ?? '')
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean)
		.map((s) => /^(['"])(.*)\1$/.exec(s)?.[2] ?? '');
	if (states.length === 0 || states.some((s) => !STATE_NAME.test(s)) || new Set(states).size !== states.length) {
		console.error(
			"export const states must be a list of one-word names (lowercase letters and digits, no hyphens), none twice, the first what the page opens in: export const states = ['default', 'empty'] as const;",
		);
		process.exit(1);
	}
}
// Its title (export const title = 'Alert history'): what the browser's tab and a screen reader name the page by.
const title = /^export const title\b[^=\n]*=\s*(['"])(.*?)\1/m.exec(source)?.[2] ?? '';
const fileLoaders = Object.fromEntries(
	['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.woff', '.woff2', '.ttf', '.eot'].map((e) => [e, 'dataurl' as const]),
);

/** Imported by path, a CommonJS package's functions may be under `default`. */
const sassAt = async (path: string): Promise<typeof import('sass')> => {
	const loaded = (await import(pathToFileURL(path).href)) as typeof import('sass') & { default?: typeof import('sass') };
	return typeof loaded.compile === 'function' ? loaded : (loaded.default as typeof import('sass'));
};

// Built from the design system's clone, as it stands, when the version says so; else from the product's installed packages.
const clone =
	flag === '--from' && designSystem && pkg && sassPath ? fromSource({ designSystem, pkg, nodeModules, sass: await sassAt(sassPath) }) : null;

try {
	const result = await build({
		stdin: {
			contents: `import P from ${JSON.stringify(`./${basename(entry)}`)};\nimport { createElement } from 'react';\nimport { createRoot } from 'react-dom/client';\ncreateRoot(document.getElementById('root')).render(createElement(P));\n`,
			resolveDir: dirname(entry),
			loader: 'tsx',
			sourcefile: 'mount.tsx',
		},
		bundle: true,
		write: false,
		outdir: 'out',
		format: 'iife',
		platform: 'browser',
		target: 'es2020',
		jsx: 'automatic',
		minify: true,
		legalComments: 'none',
		nodePaths: [nodeModules],
		loader: { ...fileLoaders, '.js': 'jsx' },
		define: { 'process.env.NODE_ENV': '"production"', global: 'globalThis' },
		logLevel: 'silent',
		metafile: true,
		plugins: clone ? [clone.plugin] : [],
	});
	const refused = clone?.check(result.metafile.inputs) ?? null;
	if (refused !== null) {
		console.error(refused);
		process.exit(1);
	}
	const js = result.outputFiles
		.filter((f) => f.path.endsWith('.js'))
		.map((f) => f.text)
		.join('\n');
	// Large embedded files (the design system's fonts are about 5 MB) are the same in every page. Each is kept once,
	// named by its content, and the page points at it; the stylesheet itself, and so its order, is untouched.
	mkdirSync(shared, { recursive: true });
	const css = result.outputFiles
		.filter((f) => f.path.endsWith('.css'))
		.map((f) => f.text)
		.join('\n')
		.replace(/url\((["']?)(data:[^)"']+)\1\)/g, (whole, _q: string, uri: string) => {
			if (uri.length < 20000) return whole;
			const hash = createHash('sha256').update(uri).digest('hex').slice(0, 16);
			writeFileSync(join(shared, `${hash}.datauri`), uri);
			return `url(/_shared/${hash})`;
		});
	const safe = (s: string) => s.replace(/<\/(script|style)/gi, '<\\/$1');
	const html =
		'<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
		(title ? `<title>${title.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</title>\n` : '') +
		(lead ? `<!--\n${lead.replace(/--/g, '- -')}\n-->\n` : '') +
		(states.length ? `<meta name=${JSON.stringify(STATES_META)} content="${states.join(',')}">\n` : '') +
		`<style>${safe(css)}</style>\n</head>\n<body>\n<div id="root"></div>\n<script>${safe(js)}</script>\n</body>\n</html>\n`;
	writeFileSync(out, html);
	console.log(`Built ${basename(out)} (${Math.round(html.length / 1024)} KB).`);
} catch (err) {
	const e = err as { errors?: { location?: { file: string; line: number; column: number } | null; text: string }[]; message?: string };
	const errors = (e.errors ?? []).map((x) => (x.location ? `${x.location.file}:${x.location.line}:${x.location.column} ` : '') + x.text);
	console.error(errors.length ? errors.join('\n') : String(e.message ?? err));
	process.exit(1);
}
