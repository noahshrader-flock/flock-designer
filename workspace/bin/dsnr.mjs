#!/usr/bin/env node
/**
 * Built from this source each time it runs, with the workspace's own esbuild, so it can never be a different version
 * from the extension beside it and there is no built copy to fall out of date.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const workspace = dirname(here);

let esbuild;
try {
	esbuild = createRequire(join(workspace, 'package.json')).resolve('esbuild');
} catch {
	console.error(`dsnr: DSNR's packages are not installed. Run npm ci in ${workspace}, then try again.`);
	process.exit(1);
}

const pkg = JSON.parse(readFileSync(join(workspace, 'package.json'), 'utf8'));

const out = mkdtempSync(join(tmpdir(), 'dsnr-'));
try {
	const { build } = await import(pathToFileURL(esbuild).href);
	const { pageCodeEsbuild, REQUIRE_BANNER } = await import(pathToFileURL(join(workspace, 'pageBundle.mjs')).href);
	const file = join(out, 'dsnr.mjs');
	await build({
		entryPoints: [join(workspace, 'src', 'cli', 'dsnr.ts')],
		outfile: file,
		bundle: true,
		platform: 'node',
		format: 'esm',
		banner: { js: REQUIRE_BANNER },
		plugins: [pageCodeEsbuild()],
		logLevel: 'error',
	});
	const { main, ghApi, openInBrowser, cliDataFolder, commandLinePrototypes } = await import(pathToFileURL(file).href);
	process.exitCode = await main(process.argv.slice(2), {
		cwd: process.cwd(),
		out: (text) => console.log(text),
		err: (text) => console.error(text),
		// Where the extension said its prototypes are, so the panel and the command keep one set.
		prototypesRoot: commandLinePrototypes(cliDataFolder(pkg.settingsFolder)),
		esbuild,
		// As it would be typed where it is run, so the commands it prints match what a repository's settings allow.
		self: ['node', relative(process.cwd(), fileURLToPath(import.meta.url))],
		github: ghApi(),
		open: openInBrowser,
		buildViewer: async () => (await import(pathToFileURL(join(workspace, 'viewerBuild.mjs')).href)).buildViewer(join(workspace, 'out', 'viewer')),
	});
} finally {
	rmSync(out, { recursive: true, force: true });
}
