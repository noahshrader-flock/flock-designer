#!/usr/bin/env node
/**
 * Runs the real application in one of its smoke modes and proves it did what the mode is for.
 *
 * A build passing says the code compiles. It does not say the window opens, the preload bridge loads, or the renderer
 * runs -- and those are exactly what a misconfigured `contextIsolation` or a wrong preload path break, silently. Each
 * mode starts Electron with its flag, which does its one job and exits; this fails unless it exits cleanly having said
 * its line.
 *
 *   npm run smoke          the application boots, the window opens, and the renderer loads
 *   npm run smoke:page     the preview view, against a local page
 *   FD_COKE=/path/to/flock-coke FD_PROJECT=<id> npm run smoke:local
 *                          a real prototype from a real Coke checkout, as the app runs one
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import electron from 'electron';

/** Each mode: the flag the app is started with, how long it may take, the line it says when it worked, and what that proves. */
const MODES = {
	boot: {
		flag: '--smoke',
		seconds: 60,
		said: 'smoke: window created and renderer loaded',
		proves: 'the application boots, the window opens, and the renderer loads',
	},
	page: {
		flag: '--smoke-page',
		seconds: 100,
		said: 'smoke-page: isolation',
		proves: 'the preview is isolated, comments anchor to real clicks, and markers hold',
	},
	local: {
		flag: '--smoke-local',
		seconds: 60,
		said: 'smoke-local: a real prototype',
		proves: 'a real prototype runs, opens in the preview, and takes a pin',
	},
};

const name = process.argv[2] ?? 'boot';
const mode = MODES[name];
if (!mode) {
	console.error(`smoke: no mode ${name}; the modes are ${Object.keys(MODES).join(', ')}`);
	process.exit(1);
}
const fail = (why) => {
	console.error(`\nsmoke ${name}: ${why}`);
	process.exit(1);
};

// ELECTRON_RUN_AS_NODE makes the Electron binary behave as plain Node, so `app` is undefined and the main process dies at
// its first line. Editors and agent harnesses are themselves Electron apps and export it, so it arrives in the environment
// without anyone setting it. Removed here rather than inherited.
const env = { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: '1' };
delete env.ELECTRON_RUN_AS_NODE;

// A folder of its own for the app's settings, removed after: a smoke run never reads or changes the person's own.
const settings = mkdtempSync(join(tmpdir(), 'dsnr-smoke-'));
process.on('exit', () => rmSync(settings, { recursive: true, force: true }));

const child = spawn(electron, ['.', mode.flag, `--user-data-dir=${settings}`], { stdio: ['ignore', 'pipe', 'pipe'], env });

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
	child.kill('SIGKILL');
	fail(`the app did not exit within ${mode.seconds}s`);
}, mode.seconds * 1000);

child.on('exit', (code) => {
	clearTimeout(timer);
	if (code !== 0) fail(`electron exited with ${code}`);
	if (!output.includes(mode.said)) fail(`the app exited cleanly but never said "${mode.said}"`);
	console.log(`\nsmoke ${name}: ${mode.proves}.`);
});
