import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { locateGh } from '../src/main/services/ghCli';
import { NOT_FAKED } from './sealed.mjs';

/**
 * The world every test runs in (`sealed.mjs`), proved from inside a test: none can reach the person's settings, GitHub
 * sign-in or remotes, whoever writes it, because a test that tried fails, saying it was not faked.
 */

let dir: string | null = null;
afterEach(() => {
	if (dir) rmSync(dir, { recursive: true, force: true });
	dir = null;
});

it('has a home of its own, in the temporary folder, and no GitHub token', () => {
	expect(realpathSync(homedir()).startsWith(realpathSync(tmpdir()))).toBe(true);
	expect(process.env.GH_TOKEN ?? '').toBe('');
	expect(process.env.GITHUB_TOKEN ?? '').toBe('');
});

it('finds a `gh` that refuses whatever it is asked, as the app finds it', () => {
	const run = spawnSync(locateGh(), ['auth', 'status'], { encoding: 'utf8' });
	expect(run.status).not.toBe(0);
	expect(run.stderr).toContain(NOT_FAKED);
});

it('refuses a push to GitHub, by any of its addresses, and keeps a push to a repository on disk', () => {
	dir = mkdtempSync(join(tmpdir(), 'dsnr-sealed-push-'));
	const git = (...args: string[]) => execFileSync('git', ['-C', dir as string, ...args], { encoding: 'utf8' });
	git('init', '-q', '-b', 'main');
	git('commit', '-q', '--allow-empty', '-m', 'test');
	for (const github of ['https://github.com/acme/ui.git', 'git@github.com:acme/ui.git']) {
		const push = spawnSync('git', ['-C', dir, 'push', github, 'main'], { encoding: 'utf8' });
		expect(push.status, github).not.toBe(0);
		expect(push.stderr, github).toContain('not-faked');
	}
	git('init', '-q', '--bare', join(dir, 'remote.git'));
	git('push', '-q', join(dir, 'remote.git'), 'main');
});
