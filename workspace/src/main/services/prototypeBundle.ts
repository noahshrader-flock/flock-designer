import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

/**
 * Turns a prototype written in React into one HTML file anyone can open.
 *
 * The prototype is a single `.tsx` file that uses the product's real design system, resolved from the
 * product's own installed packages, so what reviewers see is the real components and not an imitation.
 * Everything it needs is bundled in: the page has no build step and no network after it is made.
 *
 * **One build, two callers.** The same script is what the app runs when the page is saved and what the
 * agent runs to check its work compiles, so "it built for the agent" and "it builds when saved" are the
 * same fact. It runs as plain Node: the app runs it with its own binary, the agent with `node`.
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
		(lead ? '<!--\n' + lead.replace(/--/g, '- -') + '\n-->\n' : '') +
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
): Promise<{ ok: boolean; output: string }> =>
	new Promise((resolve) => {
		mkdirSync(dirname(out), { recursive: true });
		// Electron runs scripts as Node when told to; plain Node ignores the variable.
		const child = spawn(node, [script, esbuild, entry, out, nodeModules, shared], {
			env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
			stdio: ['ignore', 'pipe', 'pipe'],
		});
		let output = '';
		child.stdout.on('data', (d: Buffer) => (output += d.toString()));
		child.stderr.on('data', (d: Buffer) => (output += d.toString()));
		const timer = setTimeout(() => child.kill(), 120_000);
		child.on('error', (err) => {
			clearTimeout(timer);
			resolve({ ok: false, output: err.message });
		});
		child.on('exit', (code) => {
			clearTimeout(timer);
			resolve({ ok: code === 0, output: output.trim() });
		});
	});

/** The shared files a page points at, by name, so they can be kept with it and served beside it. */
export const sharedFilesOf = (html: string): string[] => [...new Set([...html.matchAll(/\/_shared\/([0-9a-f]{16})\b/g)].map((m) => m[1] as string))];
