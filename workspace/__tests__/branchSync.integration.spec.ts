import { execFileSync } from 'node:child_process';
import { renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { syncBranches } from '../src/core/services/publishing/branchSync';
import { g, madeOnce } from './fixtures';
import type { WorkspaceDescriptor } from '../src/core/services/projects/descriptor';

const descriptor: WorkspaceDescriptor = {
	version: 1,
	product: 'Coke',
	contextDir: '.dsnr',
	branchPattern: { codebase: 'feature/<project-id>' },
	commands: [],
	designSystem: { package: 'x' },
};

let dir: string;
let remote: string;
let root: string;
const remoteBranches = () => g(remote, 'for-each-ref', '--format=%(refname:short)', 'refs/heads').split('\n').filter(Boolean).sort();
const remoteSha = (branch: string) => g(remote, 'rev-parse', `refs/heads/${branch}`);

const commit = (cwd: string, branch: string, file: string, by: 'me' | 'teammate' = 'me') => {
	g(cwd, 'checkout', '-q', branch);
	writeFileSync(join(cwd, file), `${file}\n${Math.random()}`);
	g(cwd, 'add', '.');
	const author = by === 'me' ? [] : ['--author', 'Teammate <teammate@example.test>'];
	g(cwd, 'commit', '-q', ...author, '-m', file);
};
const branchFrom = (cwd: string, name: string, from = 'develop') => g(cwd, 'checkout', '-q', '-b', name, from);

madeOnce((d) => {
	dir = d;
	remote = join(dir, 'remote.git');
	root = join(dir, 'coke');
	execFileSync('git', ['init', '-q', '--bare', '-b', 'develop', remote]);
	execFileSync('git', ['clone', '-q', remote, root], { stdio: 'ignore' });
	g(root, 'config', 'user.email', 'me@example.test');
	g(root, 'config', 'user.name', 'Me');
	g(root, 'checkout', '-q', '-b', 'develop');
	writeFileSync(join(root, 'README.md'), 'x');
	g(root, 'add', '.');
	g(root, 'commit', '-q', '-m', 'base');
	g(root, 'push', '-q', '-u', 'origin', 'develop');
});

const sync = (projects: string[] = [], madeFrom: (projectId: string) => string | null = () => null) =>
	syncBranches({ root, descriptor, projects: new Set(projects), madeFrom });

describe('publishing my work branches', () => {
	it('publishes my codebase branch once its project has a folder, and tracks it', async () => {
		branchFrom(root, 'feature/role-comparison');
		commit(root, 'feature/role-comparison', 'view.tsx');
		const r = await sync(['role-comparison']);
		expect(r).toEqual({ published: ['feature/role-comparison'], problems: [], mine: ['feature/role-comparison'] });
		expect(remoteBranches()).toEqual(['develop', 'feature/role-comparison']);
		expect(g(root, 'rev-parse', '--abbrev-ref', 'feature/role-comparison@{u}')).toBe('origin/feature/role-comparison');
	});

	it('does not publish work made from another branch of mine with nothing of its own yet, and does once it has', async () => {
		branchFrom(root, 'feature/test-base');
		commit(root, 'feature/test-base', 'base.tsx');
		branchFrom(root, 'feature/device-alerts', 'feature/test-base');
		const madeFrom = g(root, 'rev-parse', 'feature/device-alerts');
		const from = (projectId: string) => (projectId === 'device-alerts' ? madeFrom : null);
		// Started and never built: the commits are the branch it was made from's.
		expect(await sync(['device-alerts'], from)).toEqual({ published: [], problems: [], mine: [] });
		expect(remoteBranches()).not.toContain('feature/device-alerts');
		commit(root, 'feature/device-alerts', 'view.tsx');
		expect(await sync(['device-alerts'], from)).toEqual({ published: ['feature/device-alerts'], problems: [], mine: ['feature/device-alerts'] });
		expect(remoteSha('feature/device-alerts')).toBe(g(root, 'rev-parse', 'feature/device-alerts'));
	});

	it('measures from the trunk where the record does not say where the work was made, as before', async () => {
		branchFrom(root, 'feature/test-base-2');
		commit(root, 'feature/test-base-2', 'base2.tsx');
		branchFrom(root, 'feature/old-record', 'feature/test-base-2');
		expect((await sync(['old-record'])).mine).toEqual(['feature/old-record']);
	});

	it('does not publish a prototype branch of old, even my own: a prototype is a page, not a branch', async () => {
		branchFrom(root, 'fd/users-inactivity-signal/i1');
		commit(root, 'fd/users-inactivity-signal/i1', 'p.tsx');
		expect(await sync(['users-inactivity-signal'])).toEqual({ published: [], problems: [], mine: [] });
		expect(remoteBranches()).toEqual(['develop']);
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
		expect(remoteSha('feature/role-comparison')).toBe(g(root, 'rev-parse', 'feature/role-comparison'));
	});
});

describe('when GitHub has something this machine does not', () => {
	it('reports a branch that has moved on, and does not overwrite it', async () => {
		branchFrom(root, 'feature/role-comparison');
		commit(root, 'feature/role-comparison', 'one.tsx');
		await sync(['role-comparison']);
		const other = join(dir, 'other');
		execFileSync('git', ['clone', '-q', '-b', 'feature/role-comparison', remote, other], { stdio: 'ignore' });
		g(other, 'config', 'user.email', 't@example.test');
		g(other, 'config', 'user.name', 'Teammate');
		writeFileSync(join(other, 'theirs.tsx'), 'theirs');
		g(other, 'add', '.');
		g(other, 'commit', '-q', '-m', 'theirs');
		g(other, 'push', '-q', 'origin', 'feature/role-comparison');
		const theirs = remoteSha('feature/role-comparison');
		commit(root, 'feature/role-comparison', 'two.tsx');

		const r = await sync(['role-comparison']);
		expect(r.published).toEqual([]);
		expect(r.problems[0]).toMatchObject({ what: 'feature/role-comparison' });
		expect(r.problems[0]?.why).toMatch(/changes on GitHub that this machine does not have/);
		expect(remoteSha('feature/role-comparison')).toBe(theirs);
	});

	it('still publishes my other branches when one of them has a problem', async () => {
		branchFrom(root, 'feature/a');
		commit(root, 'feature/a', 'a.tsx');
		await sync(['a', 'b']);
		const other = join(dir, 'other');
		execFileSync('git', ['clone', '-q', '-b', 'feature/a', remote, other], { stdio: 'ignore' });
		g(other, 'config', 'user.email', 't@example.test');
		g(other, 'config', 'user.name', 'T');
		writeFileSync(join(other, 't.tsx'), 't');
		g(other, 'add', '.');
		g(other, 'commit', '-q', '-m', 't');
		g(other, 'push', '-q', 'origin', 'feature/a');
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
