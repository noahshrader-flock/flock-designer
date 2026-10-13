/**
 * What DSNR's own scripts share: where VS Code is, how it is started, and how DSNR is packaged for it.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const extensionDir = dirname(fileURLToPath(import.meta.url));
/** Where the package is made: one file, named the same every time, so it is installed the same way every time. */
export const VSIX = join(extensionDir, 'dsnr.vsix');

/** VS Code, to open a window: `CODE_BIN` when set, the macOS app where it is usually installed, or `code` on the PATH. */
export const vscodeApp = () => {
	if (process.env.CODE_BIN) return process.env.CODE_BIN;
	const mac = '/Applications/Visual Studio Code.app/Contents/MacOS/Code';
	return existsSync(mac) ? mac : 'code';
};

/** VS Code's command line, to install an extension: `CODE_CLI` when set, the macOS app's, or `code` on the PATH. */
export const vscodeCli = () => {
	if (process.env.CODE_CLI) return process.env.CODE_CLI;
	const mac = '/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code';
	return existsSync(mac) ? mac : 'code';
};

/** The environment VS Code is started in: editors are Electron apps and may export this, which would start it as plain Node. */
export const vscodeEnv = (more = {}) => {
	const env = { ...process.env, ...more };
	delete env.ELECTRON_RUN_AS_NODE;
	return env;
};

/**
 * The platform the package is for, as VS Code names it (`darwin-arm64`, `linux-x64`, `win32-x64`): this machine's, since
 * it carries esbuild's binary for this machine. VS Code refuses it on another, rather than failing when a page is built.
 */
export const target = () => `${process.platform}-${process.arch}`;

/** Builds DSNR once, from nothing, and packages it as `dsnr.vsix` for this machine's platform. Says where it is. */
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

/**
 * Installs the package into a VS Code: the person's own, or a throwaway one (`profile`: its own settings and extensions
 * folders), replacing any DSNR already there.
 */
export const installVsix = (vsix, profile) =>
	execFileSync(
		vscodeCli(),
		['--install-extension', vsix, '--force', ...(profile ? [`--user-data-dir=${profile.user}`, `--extensions-dir=${profile.extensions}`] : [])],
		{ stdio: ['ignore', 'ignore', 'inherit'], env: vscodeEnv() },
	);
