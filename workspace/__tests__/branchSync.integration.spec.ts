import { execFileSync } from 'node:child_process';
import { mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { syncBranches } from '../src/main/services/branchSync';
import type { WorkspaceDescriptor } from '../src/main/services/descriptor';

const descriptor: WorkspaceDescriptor = {
	version: 1,
	product: 'Coke',
	contextDir: '.dsnr',
	prototypeRoot: 'src/prototypes',
	branchPattern: { prototype: 'fd/<project-id>/i<n>', codebase: 'feature/<project-id>' },
	commands: [],
	designSystem: { package: 'x' },
};

let dir: string;
let remote: string;
let root: string;
const git = (cwd: string, ...args: string[]) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim();
const remoteBranches = () => git(remote, 'for-each-ref', '--format=%(refname:short)', 'refs/heads').split('\n').filter(Boolean).sort();
const remoteSha = (branch: string) => git(remote, 'rev-parse', `refs/heads/${branch}`);

/** A commit on `branch`, by me or by a teammate. */
const commit = (cwd: string, branch: string, file: string, by: 'me' | 'teammate' = 'me') => {
	git(cwd, 'checkout', '-q', branch);
	writeFileSync(join(cwd, file), `${file}\n${Math.random()}`);
	git(cwd, 'add', '.');
	const author = by === 'me' ? [] : ['--author', 'Teammate <teammate@example.test>'];
	git(cwd, 'commit', '-q', ...author, '-m', file);
};
const branchFrom = (cwd: string, name: string, from = 'develop') => git(cwd, 'checkout', '-q', '-b', name, from);

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'fdw-bsync-'));
	remote = join(dir, 'remote.git');
	root = join(dir, 'coke');
	execFileSync('git', ['init', '-q', '--bare', '-b', 'develop', remote]);
	execFileSync('git', ['clone', '-q', remote, root], { stdio: 'ignore' });
	git(root, 'config', 'user.email', 'me@example.test');
	git(root, 'config', 'user.name', 'Me');
	git(root, 'checkout', '-q', '-b', 'develop');
	writeFileSync(join(root, 'README.md'), 'x');
	git(root, 'add', '.');
	git(root, 'commit', '-q', '-m', 'base');
	git(root, 'push', '-q', '-u', 'origin', 'develop');
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

const sync = (projects: string[] = []) => syncBranches({ root, descriptor, projects: new Set(projects) });

describe('publishing my work branches', () => {
	it('publishes my codebase branch once its project has a folder, and tracks it', async () => {
		branchFrom(root, 'feature/role-comparison');
		commit(root, 'feature/role-comparison', 'view.tsx');
		const r = await sync(['role-comparison']);
		expect(r).toEqual({ published: ['feature/role-comparison'], problems: [], mine: ['feature/role-comparison'] });
		expect(remoteBranches()).toEqual(['develop', 'feature/role-comparison']);
		expect(git(root, 'rev-parse', '--abbrev-ref', 'feature/role-comparison@{u}')).toBe('origin/feature/role-comparison');
	});

	it('publishes my prototype branch, which is self-evidently the work', async () => {
		branchFrom(root, 'fd/users-inactivity-signal/i1');
		commit(root, 'fd/users-inactivity-signal/i1', 'p.tsx');
		expect((await sync()).published).toEqual(['fd/users-inactivity-signal/i1']);
	});

	it("does not publish a teammate's ticket branch, which only looks like mine because of its name", async () => {
		branchFrom(root, 'feature/dda-1221');
		commit(root, 'feature/dda-1221', 'ticket.ts', 'teammate');
		expect(await sync()).toEqual({ published: [], problems: [], mine: [] });
		expect(remoteBranches()).toEqual(['develop']);
	});

	it('does not publish a branch with a project folder if I have no commits on it', async () => {
		branchFrom(root, 'feature/role-comparison');
		commit(root, 'feature/role-comparison', 'view.tsx', 'teammate');
		expect((await sync(['role-comparison'])).published).toEqual([]);
	});

	it('does not publish a codebase branch whose project has no folder, even if I wrote it', async () => {
		branchFrom(root, 'feature/mine-but-unregistered');
		commit(root, 'feature/mine-but-unregistered', 'x.ts');
		expect((await sync()).published).toEqual([]);
	});

	it('does not publish a branch I only just cut, with nothing of my own on it', async () => {
		branchFrom(root, 'feature/just-cut');
		expect((await sync(['just-cut'])).published).toEqual([]);
	});

	it('never publishes a branch that is not work: the baseline, a scratch branch', async () => {
		branchFrom(root, 'noah/flock-designer');
		commit(root, 'noah/flock-designer', 'tooling.mjs');
		branchFrom(root, 'scratch');
		commit(root, 'scratch', 's.txt');
		expect(await sync(['scratch', 'noah/flock-designer'])).toEqual({ published: [], problems: [], mine: [] });
		expect(remoteBranches()).toEqual(['develop']);
	});

	it('does nothing when everything is already published', async () => {
		branchFrom(root, 'feature/role-comparison');
		commit(root, 'feature/role-comparison', 'view.tsx');
		await sync(['role-comparison']);
		// Nothing to publish, but it is still this person's work, which is what lets a record be made for it.
		expect(await sync(['role-comparison'])).toEqual({ published: [], problems: [], mine: ['feature/role-comparison'] });
	});

	it('publishes new commits on a branch that is already up there, as a plain push', async () => {
		branchFrom(root, 'feature/role-comparison');
		commit(root, 'feature/role-comparison', 'one.tsx');
		await sync(['role-comparison']);
		commit(root, 'feature/role-comparison', 'two.tsx');
		const r = await sync(['role-comparison']);
		expect(r.published).toEqual(['feature/role-comparison']);
		expect(remoteSha('feature/role-comparison')).toBe(git(root, 'rev-parse', 'feature/role-comparison'));
	});
});

describe('when GitHub has something this machine does not', () => {
	it('reports a branch that has moved on, and does not overwrite it', async () => {
		branchFrom(root, 'feature/role-comparison');
		commit(root, 'feature/role-comparison', 'one.tsx');
		await sync(['role-comparison']);
		// A teammate pushes to it from another clone.
		const other = join(dir, 'other');
		execFileSync('git', ['clone', '-q', '-b', 'feature/role-comparison', remote, other], { stdio: 'ignore' });
		git(other, 'config', 'user.email', 't@example.test');
		git(other, 'config', 'user.name', 'Teammate');
		writeFileSync(join(other, 'theirs.tsx'), 'theirs');
		git(other, 'add', '.');
		git(other, 'commit', '-q', '-m', 'theirs');
		git(other, 'push', '-q', 'origin', 'feature/role-comparison');
		const theirs = remoteSha('feature/role-comparison');
		// Meanwhile I commit locally, so the two have diverged.
		commit(root, 'feature/role-comparison', 'two.tsx');

		const r = await sync(['role-comparison']);
		expect(r.published).toEqual([]);
		expect(r.problems[0]).toMatchObject({ what: 'feature/role-comparison' });
		expect(r.problems[0]?.why).toMatch(/changes on GitHub that this machine does not have/);
		expect(remoteSha('feature/role-comparison')).toBe(theirs); // untouched
	});

	it('still publishes my other branches when one of them has a problem', async () => {
		branchFrom(root, 'feature/a');
		commit(root, 'feature/a', 'a.tsx');
		await sync(['a', 'b']);
		const other = join(dir, 'other');
		execFileSync('git', ['clone', '-q', '-b', 'feature/a', remote, other], { stdio: 'ignore' });
		git(other, 'config', 'user.email', 't@example.test');
		git(other, 'config', 'user.name', 'T');
		writeFileSync(join(other, 't.tsx'), 't');
		git(other, 'add', '.');
		git(other, 'commit', '-q', '-m', 't');
		git(other, 'push', '-q', 'origin', 'feature/a');
		commit(root, 'feature/a', 'a2.tsx');
		branchFrom(root, 'feature/b', 'develop');
		commit(root, 'feature/b', 'b.tsx');
		const r = await sync(['a', 'b']);
		expect(r.published).toEqual(['feature/b']);
		expect(r.problems.map((p) => p.what)).toEqual(['feature/a']);
	});
});

describe('when GitHub cannot be reached', () => {
	it('saves nothing new, says so, and does not throw', async () => {
		branchFrom(root, 'feature/role-comparison');
		commit(root, 'feature/role-comparison', 'view.tsx');
		renameSync(remote, `${remote}.away`);
		const r = await sync(['role-comparison']);
		expect(r.published).toEqual([]);
		expect(r.problems[0]?.why).toMatch(/Could not reach GitHub.*saved here/);
		renameSync(`${remote}.away`, remote);
		expect((await sync(['role-comparison'])).published).toEqual(['feature/role-comparison']);
	});
});
