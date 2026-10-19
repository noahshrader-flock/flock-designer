/** The profile's path is short on purpose: VS Code keeps a socket in it, and a socket's path may be at most 103 characters. */
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extensionDir as here, vscodeApp, vscodeEnv } from './tools.mjs';
import { sealedEnv } from '../__tests__/sealed.mjs';

const profile = join(tmpdir(), 'dsnr-dev');

const build = spawn(process.execPath, [join(here, 'build.mjs'), '--watch'], { stdio: ['ignore', 'pipe', 'inherit'] });
let opened = false;
build.stdout.on('data', (chunk) => {
	process.stdout.write(chunk);
	if (opened || !String(chunk).includes('dsnr: watching')) return;
	opened = true;
	const window = spawn(
		vscodeApp(),
		[
			`--extensionDevelopmentPath=${here}`,
			`--user-data-dir=${join(profile, 'user')}`,
			`--extensions-dir=${join(profile, 'extensions')}`,
			'--skip-welcome',
			'--skip-release-notes',
			'--new-window',
		],
		// Sealed like the tests (`sealed.mjs`): a hand check here reaches none of the person's settings, GitHub sign-in or remotes.
		{ stdio: 'ignore', env: vscodeEnv(sealedEnv({ base: join(profile, 'world') }).env) },
	);
	window.on('error', (err) => {
		console.error(`dsnr: VS Code did not start (${err.message}). Set CODE_BIN to its path.`);
		build.kill();
		process.exit(1);
	});
	// Only on quit: on a Mac, closing its last window leaves it running.
	window.on('exit', () => {
		console.log('dsnr: the window closed; stopping the build');
		build.kill();
	});
	console.log(`dsnr: opened VS Code with DSNR (profile ${profile})`);
});
build.on('exit', (code) => process.exit(code ?? 0));
process.on('SIGINT', () => build.kill());
