/**
 * `npm run extension:dev`: DSGN from its source, in a VS Code window of its own, rebuilt as it is edited.
 *
 * Builds the extension and its page in watch mode, then opens an Extension Development Host (a second VS Code window with
 * DSGN loaded from here) on a throwaway profile in the system's temporary folder, so the person's own VS Code, its
 * settings and its extensions are never touched. The profile is kept between runs, so the panel stays where it was put.
 * Its path is short on purpose: VS Code keeps a socket in it, and a socket's path may be no longer than 103 characters.
 *
 * Quitting that VS Code (⌘Q: on a Mac, closing its last window leaves it running) stops the build. Ctrl+C here stops the
 * build and leaves the window, which then stops following changes.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const profile = join(tmpdir(), 'dsgn-dev');

/** VS Code: `CODE_BIN` when set, the macOS app where it is usually installed, or `code` on the PATH. */
const vscode = () => {
	if (process.env.CODE_BIN) return process.env.CODE_BIN;
	const mac = '/Applications/Visual Studio Code.app/Contents/MacOS/Code';
	return existsSync(mac) ? mac : 'code';
};

const build = spawn(process.execPath, [join(here, 'build.mjs'), '--watch'], { stdio: ['ignore', 'pipe', 'inherit'] });
let opened = false;
build.stdout.on('data', (chunk) => {
	process.stdout.write(chunk);
	if (opened || !String(chunk).includes('dsgn: watching')) return;
	opened = true;
	// Editors are Electron apps and may export this, which would make VS Code start as plain Node.
	const env = { ...process.env };
	delete env.ELECTRON_RUN_AS_NODE;
	const window = spawn(
		vscode(),
		[
			`--extensionDevelopmentPath=${here}`,
			`--user-data-dir=${join(profile, 'user')}`,
			`--extensions-dir=${join(profile, 'extensions')}`,
			'--skip-welcome',
			'--skip-release-notes',
			'--new-window',
		],
		{ stdio: 'ignore', env },
	);
	window.on('error', (err) => {
		console.error(`dsgn: VS Code did not start (${err.message}). Set CODE_BIN to its path.`);
		build.kill();
		process.exit(1);
	});
	window.on('exit', () => {
		console.log('dsgn: the window closed; stopping the build');
		build.kill();
	});
	console.log(`dsgn: opened VS Code with DSGN (profile ${profile})`);
});
build.on('exit', (code) => process.exit(code ?? 0));
process.on('SIGINT', () => build.kill());
