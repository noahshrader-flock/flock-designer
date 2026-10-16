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
import { homedir, tmpdir } from 'node:os';
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

/** The command's prototype folder: DSNR's data folder in the person's application-data directory, named by the package's `settingsFolder`. */
const pkg = JSON.parse(readFileSync(join(workspace, 'package.json'), 'utf8'));
const appData =
	process.platform === 'darwin'
		? join(homedir(), 'Library', 'Application Support')
		: process.platform === 'win32'
			? (process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'))
			: (process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'));

const out = mkdtempSync(join(tmpdir(), 'dsnr-'));
try {
	const { build } = await import(pathToFileURL(esbuild).href);
	const file = join(out, 'dsnr.mjs');
	await build({
		entryPoints: [join(workspace, 'src', 'cli', 'dsnr.ts')],
		outfile: file,
		bundle: true,
		platform: 'node',
		format: 'esm',
		// A package written for require (the browser's driver, which measuring accessibility starts) still has it here.
		banner: { js: "import { createRequire as __dsnrRequire } from 'node:module'; const require = __dsnrRequire(import.meta.url);" },
		logLevel: 'error',
	});
	const { main, ghApi, openInBrowser } = await import(pathToFileURL(file).href);
	process.exitCode = await main(process.argv.slice(2), {
		cwd: process.cwd(),
		out: (text) => console.log(text),
		err: (text) => console.error(text),
		prototypesRoot: join(appData, pkg.settingsFolder, 'prototypes'),
		esbuild,
		// As it would be typed where it is run, so the commands it prints match what a repository's settings allow.
		self: ['node', relative(process.cwd(), fileURLToPath(import.meta.url))],
		github: ghApi(),
		open: openInBrowser,
		// The comments on the site's pages: built with the app's own Vite, from its own source.
		buildViewer: async () => {
			const { build } = await import('vite');
			await build({ configFile: join(workspace, 'viewer.vite.config.ts') });
			return join(workspace, 'out', 'viewer');
		},
	});
} finally {
	rmSync(out, { recursive: true, force: true });
}
