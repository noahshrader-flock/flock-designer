/**
 * Builds DSNR: the extension's own code for VS Code (Node, with `vscode` left to VS Code), its panel's page (the browser),
 * each into one file under `dist/`, the codicons beside them, and the viewer a prototype's review page carries
 * (`dist/viewer`, once: it is the app's own). `--watch` rebuilds on every change and says
 * when it has.
 *
 *   node extension/build.mjs          once
 *   node extension/build.mjs --watch  on every change
 */
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { context } from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, 'dist');
const watch = process.argv.includes('--watch');

/** The builds not yet finished once: when none is left, watching is said, so what waits for that can open the build. */
const waiting = new Set(['extension', 'panel', 'viewer']);

/** Says when a build has finished, and what went wrong if it did not. */
const report = (name) => ({
	name: 'report',
	setup: (build) =>
		build.onEnd((result) => {
			console.log(result.errors.length ? `dsnr: ${name} failed (${result.errors.length} errors)` : `dsnr: ${name} built`);
			if (watch && waiting.delete(name) && waiting.size === 0) console.log('dsnr: watching for changes');
		}),
});

const builds = [
	{
		entryPoints: [join(here, 'src/extension.ts')],
		outfile: join(dist, 'extension.js'),
		platform: 'node',
		format: 'cjs',
		target: 'node20',
		// VS Code gives `vscode`; esbuild finds its own native binary when it runs, so it cannot be bundled.
		external: ['vscode', 'esbuild'],
		plugins: [report('extension')],
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

mkdirSync(dist, { recursive: true });
// The codicons, from the package, beside the page that loads them.
const codicons = join(here, '../node_modules/@vscode/codicons/dist');
for (const file of ['codicon.css', 'codicon.ttf']) copyFileSync(join(codicons, file), join(dist, file));

/** A prototype's review page carries the app's own viewer (its review bar and comments), built with the app's own config. */
const viewer = async () => {
	const { build } = await import('vite');
	await build({ configFile: join(here, '../viewer.vite.config.ts'), logLevel: 'warn', build: { outDir: join(dist, 'viewer'), emptyOutDir: true } });
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
