import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CloneProblem, Cloner, cloneProblem, readProgress } from '../src/main/services/clone';
import { g, makeProduct } from './fixtures';

/**
 * The clone itself (C2 of the clone plan), against a bare repository on this machine standing in for GitHub, and, for
 * what real git cannot be made to do on cue (wait, or be refused), a stand-in git that says what GitHub's would.
 */

let root: string;
let folder: string;
let remote: string;
const REPO = 'flocksafety/flock-coke';
const VISIBLE = ['noah/other', 'FlockSafety/flock-coke'];
const fromRemote = { urlOf: () => `file://${remote}` };

/** A git that writes `stderr`, waits `seconds`, and exits with `code`. */
const fakeGit = (stderr: string, code: number, seconds = 0): string => {
	const file = join(root, `git-${Math.random().toString(36).slice(2)}`);
	writeFileSync(file, `#!/bin/sh\nprintf '%b' '${stderr.replace(/'/g, "'\\''")}' >&2\nsleep ${seconds}\nexit ${code}\n`);
	chmodSync(file, 0o755);
	return file;
};

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), 'fdw-clone-'));
	folder = join(root, 'GitHub');
	const source = join(root, 'source');
	makeProduct(source);
	remote = join(root, 'remote.git');
	g(root, 'clone', '-q', '--bare', source, remote);
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('cloning', () => {
	it('clones a repository from the person’s list into <folder>/<repo>, making the folder', async () => {
		const seen: string[] = [];
		const done = await new Cloner(fromRemote).clone({ repository: REPO, visible: VISIBLE, folder }, (p) => seen.push(p.step));
		expect(done).toEqual({ path: join(folder, 'flock-coke'), cloned: true });
		expect(readFileSync(join(folder, 'flock-coke', 'README.md'), 'utf8')).toBe('# r\n');
		expect(g(join(folder, 'flock-coke'), 'branch', '--show-current').trim()).toBe('develop');
		// Through git's own transport, so its progress is read as it goes.
		expect(seen).toContain('Receiving objects');
	});

	it('uses a clone of the same repository already there, and clones nothing', async () => {
		await new Cloner(fromRemote).clone({ repository: REPO, visible: VISIBLE, folder });
		// Its origin says GitHub, as a real clone's would.
		g(join(folder, 'flock-coke'), 'remote', 'set-url', 'origin', 'https://github.com/flocksafety/flock-coke.git');
		const again = await new Cloner({ git: fakeGit('should not run', 1) }).clone({ repository: REPO, visible: VISIBLE, folder });
		expect(again).toEqual({ path: join(folder, 'flock-coke'), cloned: false });
	});

	it('refuses a folder with something else in it, and leaves it untouched', async () => {
		mkdirSync(join(folder, 'flock-coke'), { recursive: true });
		writeFileSync(join(folder, 'flock-coke', 'notes.txt'), 'mine');
		await expect(new Cloner(fromRemote).clone({ repository: REPO, visible: VISIBLE, folder })).rejects.toThrow(
			/not a clone of[\s\S]*Nothing was cloned over it/,
		);
		expect(readdirSync(join(folder, 'flock-coke'))).toEqual(['notes.txt']);
	});

	it('refuses a repository that is not in the person’s list, before anything is made', async () => {
		await expect(new Cloner(fromRemote).clone({ repository: 'someone/secret', visible: VISIBLE, folder })).rejects.toThrow(
			/not one of the repositories your GitHub account can see/,
		);
		expect(existsSync(folder)).toBe(false);
	});

	it('leaves nothing behind when it is stopped part way', async () => {
		const stop = new AbortController();
		const cloner = new Cloner({ git: fakeGit('Receiving objects:  10% (1/10)\\r', 0, 5) });
		const running = cloner.clone({ repository: REPO, visible: VISIBLE, folder }, () => stop.abort(), stop.signal);
		await expect(running).rejects.toThrow(/was stopped\. Nothing was left behind/);
		expect(existsSync(join(folder, 'flock-coke'))).toBe(false);
	});

	it('removes the folder it made when git fails, and keeps an empty one the person had', async () => {
		const failing = { urlOf: () => `file://${join(root, 'no-such.git')}` };
		await expect(new Cloner(failing).clone({ repository: REPO, visible: VISIBLE, folder })).rejects.toThrow(CloneProblem);
		expect(existsSync(join(folder, 'flock-coke'))).toBe(false);
		mkdirSync(join(folder, 'flock-coke'), { recursive: true });
		await expect(new Cloner(failing).clone({ repository: REPO, visible: VISIBLE, folder })).rejects.toThrow(CloneProblem);
		expect(existsSync(join(folder, 'flock-coke'))).toBe(true);
	});

	it('clones one at a time', async () => {
		const cloner = new Cloner({ git: fakeGit('', 0, 1) });
		const first = cloner.clone({ repository: REPO, visible: VISIBLE, folder });
		await expect(cloner.clone({ repository: 'noah/other', visible: VISIBLE, folder })).rejects.toThrow(/Already cloning FlockSafety\/flock-coke/);
		await first;
	});
});

describe('what it says when it cannot', () => {
	it('says how to sign git in when GitHub refuses, as it does with no terminal to ask in', async () => {
		const refused = fakeGit("Cloning into 'x'...\\nfatal: could not read Username for 'https://github.com': terminal prompts disabled\\n", 128);
		await expect(new Cloner({ git: refused }).clone({ repository: REPO, visible: VISIBLE, folder })).rejects.toThrow(
			/gh auth setup-git[\s\S]*sign in to git/,
		);
		expect(existsSync(join(folder, 'flock-coke'))).toBe(false);
	});

	it('says where to get git, on a Mac and on Windows, when there is none', async () => {
		await expect(new Cloner({ git: join(root, 'no-git-here') }).clone({ repository: REPO, visible: VISIBLE, folder })).rejects.toThrow(
			/xcode-select --install[\s\S]*Git for Windows/,
		);
	});

	it('tells being refused from being offline and from a full disk', () => {
		expect(cloneProblem(REPO, 'remote: Repository not found.\nfatal: repository not found')).toMatch(/cannot read it/);
		expect(cloneProblem(REPO, 'fatal: unable to access: Could not resolve host: github.com')).toMatch(/Could not reach GitHub/);
		expect(cloneProblem(REPO, 'fatal: write error: No space left on device')).toMatch(/not enough disk space/);
		expect(cloneProblem(REPO, 'fatal: something new')).toBe(`Could not clone ${REPO}: fatal: something new`);
	});
});

describe("reading git's progress", () => {
	it('reads the phase and how far through it, and nothing else', () => {
		expect(readProgress('Receiving objects:  45% (450/1000), 1.20 MiB | 2.00 MiB/s')).toEqual({ step: 'Receiving objects', percent: 45 });
		expect(readProgress('remote: Compressing objects: 100% (12/12), done.')).toEqual({ step: 'Compressing objects', percent: 100 });
		expect(readProgress('Updating files:  7% (3/40)')).toEqual({ step: 'Updating files', percent: 7 });
		expect(readProgress("Cloning into 'flock-coke'...")).toBeNull();
	});
});
