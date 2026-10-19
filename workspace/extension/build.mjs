import { copyFileSync, cpSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { context } from 'esbuild';
import { pageCodeEsbuild } from '../pageBundle.mjs';
import { buildViewer } from '../viewerBuild.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, 'dist');
const watch = process.argv.includes('--watch');

/** When none is left, watching is said, so what waits for that (`dev.mjs`) can open the window. */
const waiting = new Set(['extension', 'panel', 'viewer']);

const report = (name) => ({
	name: 'report',
	setup: (build) =>
		build.onEnd((result) => {
			console.log(result.errors.length ? `dsnr: ${name} failed (${result.errors.length} errors)` : `dsnr: ${name} built`);
			if (watch && waiting.delete(name) && waiting.size === 0) console.log('dsnr: watching for changes');
		}),
});

/** @type {import('esbuild').BuildOptions[]} */
const builds = [
	{
		entryPoints: [join(here, 'src/extension.ts')],
		outfile: join(dist, 'extension.js'),
		platform: 'node',
		format: 'cjs',
		target: 'node20',
		// VS Code gives `vscode`; esbuild finds its own native binary when it runs, so it cannot be bundled: it is copied in.
		external: ['vscode', 'esbuild'],
		plugins: [pageCodeEsbuild(), report('extension')],
	},
	{
		entryPoints: [join(here, 'webview/main.tsx')],
		outfile: join(dist, 'webview.js'),
		platform: 'browser',
		format: 'iife',
		target: 'es2022',
		jsx: 'automatic',
		plugins: [report('panel')],
	},
];

// A build made once starts from nothing, so what is packaged is what was just built (a watch build leaves source maps).
if (!watch) rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
const codicons = join(here, '../node_modules/@vscode/codicons/dist');
for (const file of ['codicon.css', 'codicon.ttf']) copyFileSync(join(codicons, file), join(dist, file));
// The compiler's type libraries, where the extension looks for them (`typeLibs`): the compiler itself is in `extension.js`.
const typescript = join(here, '../node_modules/typescript');
mkdirSync(join(dist, 'node_modules/typescript/lib'), { recursive: true });
copyFileSync(join(typescript, 'package.json'), join(dist, 'node_modules/typescript/package.json'));
for (const lib of readdirSync(join(typescript, 'lib')).filter((f) => /^lib\..*\.d\.ts$/.test(f)))
	copyFileSync(join(typescript, 'lib', lib), join(dist, 'node_modules/typescript/lib', lib));
// esbuild, and its binary for this machine, where the extension looks for it (`esbuildEntry`, beside `extension.js`).
const modules = join(here, '../node_modules');
// PostCSS, which a library's own PostCSS configuration runs on in a process of its own (`postcssProcess.ts`), with the
// packages it depends on, where that process is given it.
const postcss = JSON.parse(readFileSync(join(modules, 'postcss/package.json'), 'utf8'));
for (const p of ['postcss', ...Object.keys(postcss.dependencies ?? {})]) cpSync(join(modules, p), join(dist, 'node_modules', p), { recursive: true });
cpSync(join(modules, 'esbuild'), join(dist, 'node_modules/esbuild'), { recursive: true });
for (const binary of readdirSync(join(modules, '@esbuild')))
	cpSync(join(modules, '@esbuild', binary), join(dist, 'node_modules/@esbuild', binary), { recursive: true });

const viewer = async () => {
	await buildViewer(join(dist, 'viewer'));
	console.log('dsnr: viewer built');
	if (watch && waiting.delete('viewer') && waiting.size === 0) console.log('dsnr: watching for changes');
};
await viewer();

const contexts = await Promise.all(builds.map((b) => context({ bundle: true, sourcemap: watch, minify: !watch, logLevel: 'warning', ...b })));
if (watch) await Promise.all(contexts.map((c) => c.watch()));
else {
	await Promise.all(contexts.map((c) => c.rebuild()));
	await Promise.all(contexts.map((c) => c.dispose()));
}
