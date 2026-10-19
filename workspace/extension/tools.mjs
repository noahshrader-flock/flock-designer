import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const extensionDir = dirname(fileURLToPath(import.meta.url));
export const VSIX = join(extensionDir, 'dsnr.vsix');

export const vscodeApp = () => {
	if (process.env.CODE_BIN) return process.env.CODE_BIN;
	const mac = '/Applications/Visual Studio Code.app/Contents/MacOS/Code';
	return existsSync(mac) ? mac : 'code';
};

export const vscodeCli = () => {
	if (process.env.CODE_CLI) return process.env.CODE_CLI;
	const mac = '/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code';
	return existsSync(mac) ? mac : 'code';
};

/** Editors are Electron apps and may export `ELECTRON_RUN_AS_NODE`, which would start VS Code as plain Node. */
export const vscodeEnv = (more = {}) => {
	/** @type {NodeJS.ProcessEnv} */
	const env = { ...process.env, ...more };
	delete env.ELECTRON_RUN_AS_NODE;
	return env;
};

/**
 * This machine's, since the package carries esbuild's binary for it: VS Code refuses it on another, rather than failing
 * when a page is built.
 */
export const target = () => `${process.platform}-${process.arch}`;

export const packageVsix = () => {
	execFileSync(process.execPath, [join(extensionDir, 'build.mjs')], { stdio: 'inherit' });
	const vsce = join(extensionDir, '../node_modules/.bin/vsce');
	execFileSync(vsce, ['package', '--no-dependencies', '--allow-missing-repository', '--skip-license', '--target', target(), '--out', VSIX], {
		cwd: extensionDir,
		stdio: ['ignore', 'ignore', 'inherit'],
	});
	const { version } = JSON.parse(readFileSync(join(extensionDir, 'package.json'), 'utf8'));
	console.log(`dsnr: packaged DSNR ${version} for ${target()} as ${VSIX}`);
	return VSIX;
};

export const installVsix = (vsix, profile) =>
	execFileSync(
		vscodeCli(),
		['--install-extension', vsix, '--force', ...(profile ? [`--user-data-dir=${profile.user}`, `--extensions-dir=${profile.extensions}`] : [])],
		{ stdio: ['ignore', 'ignore', 'inherit'], env: vscodeEnv() },
	);
