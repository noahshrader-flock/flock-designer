#!/usr/bin/env node
/**
 * Runs `dsnr` (src/cli/dsnr.ts): making a prototype from Claude Code in VS Code, with no app running.
 *
 * It is built from the app's own source each time it runs, with the bundler the app already installed, so it can
 * never be a different version from the app beside it, and there is no built copy to fall out of date. The same
 * bundler builds the prototypes, so nothing is needed here that making one in the app does not already need.
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

/** The command's data folder, in the person's application-data directory, named by the package's `settingsFolder`. */
const pkg = JSON.parse(readFileSync(join(workspace, 'package.json'), 'utf8'));

const out = mkdtempSync(join(tmpdir(), 'dsnr-'));
try {
	const { build } = await import(pathToFileURL(esbuild).href);
	// What runs inside a measured page (`src/page`) is carried as text, built the way every build carries it.
	const { pageCodeEsbuild, REQUIRE_BANNER } = await import(pathToFileURL(join(workspace, 'pageBundle.mjs')).href);
	const file = join(out, 'dsnr.mjs');
	await build({
		entryPoints: [join(workspace, 'src', 'cli', 'dsnr.ts')],
		outfile: file,
		bundle: true,
		platform: 'node',
		format: 'esm',
		// A package written for require (the browser's driver, which measuring accessibility starts) still has it here.
		banner: { js: REQUIRE_BANNER },
		plugins: [pageCodeEsbuild()],
		logLevel: 'error',
	});
	const { main, ghApi, openInBrowser, cliDataFolder, commandLinePrototypes } = await import(pathToFileURL(file).href);
	process.exitCode = await main(process.argv.slice(2), {
		cwd: process.cwd(),
		out: (text) => console.log(text),
		err: (text) => console.error(text),
		// The extension's prototypes, where it said they are, so the panel and the command keep one set.
		prototypesRoot: commandLinePrototypes(cliDataFolder(pkg.settingsFolder)),
		esbuild,
		// As it would be typed where it is run, so the commands it prints match what a repository's settings allow.
		self: ['node', relative(process.cwd(), fileURLToPath(import.meta.url))],
		github: ghApi(),
		open: openInBrowser,
		// The comments on the site's pages: built as every build builds the viewer, from this source.
		buildViewer: async () => (await import(pathToFileURL(join(workspace, 'viewerBuild.mjs')).href)).buildViewer(join(workspace, 'out', 'viewer')),
	});
} finally {
	rmSync(out, { recursive: true, force: true });
}
