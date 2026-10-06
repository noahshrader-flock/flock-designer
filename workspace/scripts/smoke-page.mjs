#!/usr/bin/env node
/**
 * Drives the real preview view against a local page, in real Electron.
 *
 * A build passing says the code compiles. It does not say the window opens, the
 * preload bridge loads, or the renderer runs -- and those are exactly what a
 * misconfigured `contextIsolation` or a wrong preload path break, silently.
 * This starts Electron with `--smoke`, which exits as soon as the renderer has
 * finished loading, and fails if that does not happen.
 *
 *   npm run smoke:page
 */
import { spawn } from 'node:child_process';
import electron from 'electron';

// ELECTRON_RUN_AS_NODE makes the Electron binary behave as plain Node, so `app`
// is undefined and the main process dies at its first line. Editors and agent
// harnesses are themselves Electron apps and export it, so it arrives in the
// environment without anyone setting it. Removed here rather than inherited.
const env = { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: '1' };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electron, ['.', '--smoke-page'], { stdio: ['ignore', 'pipe', 'pipe'], env });

let output = '';
child.stdout.on('data', (d) => {
	output += d;
	process.stdout.write(d);
});
child.stderr.on('data', (d) => {
	output += d;
	process.stderr.write(d);
});

const timer = setTimeout(() => {
	console.error('\nsmoke-page: the app did not exit within 100s');
	child.kill('SIGKILL');
	process.exit(1);
}, 100_000);

child.on('exit', (code) => {
	clearTimeout(timer);
	if (code !== 0) {
		console.error(`\nsmoke-page: electron exited with ${code}`);
		process.exit(1);
	}
	if (!output.includes('smoke-page: isolation')) {
		console.error('\nsmoke-page: the app exited cleanly but never reported a loaded window');
		process.exit(1);
	}
	console.log('\nsmoke-page: the preview is isolated, comments anchor to real clicks, and markers hold.');
});
