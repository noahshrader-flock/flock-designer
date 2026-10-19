import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { STATE_NAME, STATES_META } from '../../../shared/prototypeStates';
import { ProcessFailed, runFile } from '../platform/process';

/**
 * Turns a React prototype, built against the product's own installed design system, into one self-contained HTML file.
 * The app runs the same script on save as the agent runs to check its work compiles, so "it built for the agent" and "it
 * builds when saved" are the same fact. It runs as plain Node.
 */

const SCRIPT = String.raw`
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, basename, join } from 'node:path';
const [, , esbuildPath, entry, out, nodeModules, shared] = process.argv;
const { build } = await import(esbuildPath);
const source = readFileSync(entry, 'utf8');
// The comment the page opens with (what it shows, where it sits, its gaps) travels into the HTML for reviewers.
const lead = /^\s*\/\*([\s\S]*?)\*\//.exec(source)?.[1]?.replace(/^\s*\* ?/gm, '').trim() ?? '';
// The states it says it has (export const states = ['default', ...], the first what it opens in) go into the page as a
// tag, for the bar to offer. Read from the source as written, not run: a list that is not plain names fails the build.
let states = [];
if (/^export const states\b/m.test(source)) {
	const list = /^export const states\b[^=\n]*=\s*\[([^\]]*)\]/m.exec(source);
	const name = new RegExp(${JSON.stringify(STATE_NAME.source)});
	states = (list?.[1] ?? '').split(',').map((s) => s.trim()).filter(Boolean).map((s) => /^(['"])(.*)\1$/.exec(s)?.[2] ?? '');
	if (states.length === 0 || states.some((s) => !name.test(s)) || new Set(states).size !== states.length) {
		console.error("export const states must be a list of one-word names (lowercase letters and digits, no hyphens), none twice, the first what the page opens in: export const states = ['default', 'empty'] as const;");
		process.exit(1);
	}
}
// Its title (export const title = 'Alert history'): what the browser's tab and a screen reader name the page by.
const title = /^export const title\b[^=\n]*=\s*(['"])(.*?)\1/m.exec(source)?.[2] ?? '';
const fileLoaders = Object.fromEntries(['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.woff', '.woff2', '.ttf', '.eot'].map((e) => [e, 'dataurl']));
try {
	const result = await build({
		stdin: {
			contents: 'import P from ' + JSON.stringify('./' + basename(entry)) + ";\nimport { createElement } from 'react';\nimport { createRoot } from 'react-dom/client';\ncreateRoot(document.getElementById('root')).render(createElement(P));\n",
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
	});
	const js = result.outputFiles.filter((f) => f.path.endsWith('.js')).map((f) => f.text).join('\n');
	// Large embedded files (the design system's fonts are about 5 MB) are the same in every page. Each is kept once,
	// named by its content, and the page points at it; the stylesheet itself, and so its order, is untouched.
	mkdirSync(shared, { recursive: true });
	const css = result.outputFiles
		.filter((f) => f.path.endsWith('.css'))
		.map((f) => f.text)
		.join('\n')
		.replace(/url\((["']?)(data:[^)"']+)\1\)/g, (whole, _q, uri) => {
			if (uri.length < 20000) return whole;
			const hash = createHash('sha256').update(uri).digest('hex').slice(0, 16);
			writeFileSync(join(shared, hash + '.datauri'), uri);
			return 'url(/_shared/' + hash + ')';
		});
	const safe = (s) => s.replace(/<\/(script|style)/gi, '<\\/$1');
	const html =
		'<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
		(title ? '<title>' + title.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</title>\n' : '') +
		(lead ? '<!--\n' + lead.replace(/--/g, '- -') + '\n-->\n' : '') +
		(states.length ? '<meta name=${JSON.stringify(STATES_META)} content="' + states.join(',') + '">\n' : '') +
		'<style>' + safe(css) + '</style>\n</head>\n<body>\n<div id="root"></div>\n<script>' + safe(js) + '</script>\n</body>\n</html>\n';
	writeFileSync(out, html);
	console.log('Built ' + basename(out) + ' (' + Math.round(html.length / 1024) + ' KB).');
} catch (err) {
	const errors = (err.errors ?? []).map((e) => (e.location ? e.location.file + ':' + e.location.line + ':' + e.location.column + ' ' : '') + e.text);
	console.error(errors.length ? errors.join('\n') : String(err.message ?? err));
	process.exit(1);
}
`;

/** Where the bundler lives, resolved from this app, so neither caller needs it installed anywhere else. */
export const esbuildEntry = (): string | null => {
	try {
		return createRequire(__filename).resolve('esbuild');
	} catch {
		return null;
	}
};

/** Writes the build script into the app's prototype folder and says where it is. */
export const writeBundleScript = (prototypesRoot: string): string => {
	mkdirSync(prototypesRoot, { recursive: true });
	const path = join(prototypesRoot, 'build-prototype.mjs');
	writeFileSync(path, SCRIPT);
	return path;
};

/**
 * Writes the build's own accessibility check beside the build script: one bundled module, run with Node as the
 * build is, and loaded only when it is wanted, as it carries a browser's driver. Where it is.
 */
export const writeCheckScript = async (prototypesRoot: string): Promise<string> => {
	const { default: script } = await import('../../../cli/checkPrototype?script');
	mkdirSync(prototypesRoot, { recursive: true });
	const path = join(prototypesRoot, 'check-prototype.mjs');
	if (!existsSync(path) || readFileSync(path, 'utf8') !== script) writeFileSync(path, script);
	return path;
};

/** A command as one line an agent can run, each argument quoted only when it needs to be. */
export const shellLine = (args: string[]): string => args.map((a) => (/^[\w./-]+$/.test(a) ? a : JSON.stringify(a))).join(' ');

/** The exact command the agent runs to check its prototype builds. */
export const bundleCommand = (script: string, esbuild: string, entry: string, out: string, nodeModules: string, shared: string): string =>
	shellLine(['node', script, esbuild, entry, out, nodeModules, shared]);

/**
 * Builds `entry` into `out`. Resolves with what the build said, and whether it worked; never throws for a
 * prototype that does not compile, since that is the person's or agent's to fix, not the app's.
 */
export const runBundle = (
	script: string,
	esbuild: string,
	entry: string,
	out: string,
	nodeModules: string,
	shared: string,
	node: string = process.execPath,
): Promise<{ ok: boolean; output: string }> => {
	mkdirSync(dirname(out), { recursive: true });
	// VS Code's extension host is Electron, which runs a script as Node only when told to; plain Node ignores the variable.
	return runFile(node, [script, esbuild, entry, out, nodeModules, shared], { timeoutMs: 120_000, env: { ELECTRON_RUN_AS_NODE: '1' } }).then(
		(r) => ({ ok: true, output: `${r.stdout}${r.stderr}`.trim() }),
		(err: Error) => ({ ok: false, output: err instanceof ProcessFailed ? `${err.stdout}${err.stderr}`.trim() || err.message : err.message }),
	);
};
