import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Installer, installProblem } from '../src/core/services/codebase/install';

/** A small node script stands in for npm. */

let root: string;
const node = (script: string) => ({ id: 'install', label: 'Install', argv: [process.execPath, '-e', script] });

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), 'fdw-install-'));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('installing', () => {
	it('runs the declared command in the repository, passing on each line it prints', async () => {
		const lines: string[] = [];
		const script = "console.log('added 12 packages'); require('fs').mkdirSync('node_modules/x', { recursive: true });";
		await new Installer().install(root, node(script), (l) => lines.push(l));
		expect(lines).toEqual(['added 12 packages']);
		expect(existsSync(join(root, 'node_modules', 'x'))).toBe(true);
	});

	it('says how to sign in when GitHub Packages refuses, as npm says it does', async () => {
		const npm =
			"console.error('npm error code E401'); console.error('npm error 401 Unauthorized - GET https://npm.pkg.github.com/@flocksafety%2fx - authentication token not provided'); process.exit(1);";
		await expect(new Installer().install(root, node(npm))).rejects.toThrow(
			/not signed in to GitHub Packages[\s\S]*npm login --auth-type=legacy --registry=https:\/\/npm\.pkg\.github\.com/,
		);
	});

	it('says to install Node, at the version the repository asks for, when there is no npm', async () => {
		writeFileSync(join(root, '.nvmrc'), 'v22.13.1\n');
		const missing = { id: 'install', label: 'Install', argv: [join(root, 'no-npm-here'), 'ci'] };
		await expect(new Installer().install(root, missing)).rejects.toThrow(
			/was not found on this computer\. Install Node\.js \(this repository asks for v22\.13\.1\)/,
		);
	});

	it('stops when asked, and says it can be run again', async () => {
		const stop = new AbortController();
		const running = new Installer().install(root, node("console.log('working'); setTimeout(() => {}, 10000);"), () => stop.abort(), stop.signal);
		await expect(running).rejects.toThrow(/was stopped\. Run it again/);
	});

	it('installs one at a time', async () => {
		const installer = new Installer();
		const first = installer.install(root, node('setTimeout(() => {}, 300);'));
		await expect(installer.install(root, node(''))).rejects.toThrow(/Already installing/);
		await first;
	});
});

describe('what it says when it cannot', () => {
	it('tells another registry’s refusal, a full disk, being offline and the wrong Node apart', () => {
		expect(installProblem('npm error 403 Forbidden - GET https://registry.example.test/x', null)).toBe(
			'https://registry.example.test refused npm on this computer. Sign in to it as your team does, then try again.',
		);
		expect(installProblem('npm error code ENOSPC', null)).toMatch(/not enough disk space/);
		expect(installProblem('npm error code ENOTFOUND', null)).toMatch(/Could not reach the package registry/);
		expect(installProblem('npm warn EBADENGINE Unsupported engine', 'v22.13.1')).toMatch(/need Node v22\.13\.1/);
		expect(installProblem('npm error something new\nnpm error A complete log is at /tmp/x.log', null)).toBe(
			'The packages did not install: npm error something new npm error A complete log is at /tmp/x.log',
		);
	});
});
