import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { syncRecords } from '../src/main/services/designSync';

/**
 * The real thing, against real repositories: a bare "GitHub", this machine's clone, and a teammate's
 * clone. Mocking git here would test the mock; what matters is what git actually does.
 */

let dir: string;
let remote: string;
let mine: string;
let theirs: string;
const git = (cwd: string, ...args: string[]) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim();
const onRemote = (path: string) => git(remote, 'show', `main:${path}`);
const remoteHas = (path: string) => {
	try {
		git(remote, 'cat-file', '-e', `main:${path}`);
		return true;
	} catch {
		return false;
	}
};
const write = (root: string, path: string, body: string) => {
	mkdirSync(join(root, path, '..'), { recursive: true });
	writeFileSync(join(root, path), body);
};
const record = (name: string, extra: Record<string, unknown> = {}) => ({ projectId: 'p', name, branch: `fd/p/${name}`, commit: null, createdAt: '2026-10-01T00:00:00Z', note: '', ...extra });
const commitAll = (root: string, msg: string) => {
	git(root, 'add', '-A');
	git(root, 'commit', '-q', '-m', msg);
};

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'fdw-dsync-'));
	remote = join(dir, 'remote.git');
	execFileSync('git', ['init', '-q', '--bare', '-b', 'main', remote]);
	for (const [name, who] of [['mine', 'Me'], ['theirs', 'Teammate']] as const) {
		const root = join(dir, name);
		execFileSync('git', ['clone', '-q', remote, root], { stdio: 'ignore' });
		git(root, 'config', 'user.email', `${name}@example.test`);
		git(root, 'config', 'user.name', who);
	}
	mine = join(dir, 'mine');
	theirs = join(dir, 'theirs');
	write(mine, '.gitignore', 'projects/*/comments.md\nprojects/*/comment-pictures/\n');
	write(mine, 'README.md', '# design\n');
	write(mine, 'projects/p/brief.md', '# P\n');
	write(mine, 'projects/p/iterations.json', `${JSON.stringify([record('i1')], null, 2)}\n`);
	commitAll(mine, 'base');
	git(mine, 'push', '-q', '-u', 'origin', 'HEAD:main');
	git(mine, 'branch', '-q', '-M', 'main');
	git(mine, 'branch', '-q', '-u', 'origin/main');
	git(theirs, 'pull', '-q', 'origin', 'main');
	git(theirs, 'branch', '-q', '-M', 'main');
	git(theirs, 'branch', '-q', '-u', 'origin/main');
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('publishing records', () => {
	it('publishes a new project folder, and the tree is clean afterwards', async () => {
		write(mine, 'projects/new-view/brief.md', '# New view\n');
		write(mine, 'projects/new-view/context-receipt.md', 'receipt');
		write(mine, 'projects/new-view/iterations.json', `${JSON.stringify([record('codebase')], null, 2)}\n`);
		const r = await syncRecords(mine);
		expect(r).toEqual({ published: ['new-view'], problems: [] });
		expect(onRemote('projects/new-view/brief.md')).toBe('# New view');
		expect(git(mine, 'status', '--porcelain')).toBe('');
		expect(git(mine, 'rev-list', '--count', 'origin/main..HEAD')).toBe('0');
	});

	it('publishes a change to a record it already knew', async () => {
		write(mine, 'projects/p/iterations.json', `${JSON.stringify([record('i1', { commit: 'abc123' })], null, 2)}\n`);
		const r = await syncRecords(mine);
		expect(r.published).toEqual(['p']);
		expect(JSON.parse(onRemote('projects/p/iterations.json'))[0].commit).toBe('abc123');
		expect(git(remote, 'log', '-1', '--format=%s', 'main')).toBe('Update p');
	});

	it('does nothing, and makes no commit, when there is nothing to publish', async () => {
		const before = git(mine, 'rev-parse', 'HEAD');
		expect(await syncRecords(mine)).toEqual({ published: [], problems: [] });
		expect(git(mine, 'rev-parse', 'HEAD')).toBe(before);
	});

	it('never publishes the generated files', async () => {
		write(mine, 'projects/p/comments.md', 'generated');
		write(mine, 'projects/p/comment-pictures/1.jpg', 'x');
		expect(await syncRecords(mine)).toEqual({ published: [], problems: [] });
		expect(remoteHas('projects/p/comments.md')).toBe(false);
	});

	it('leaves other uncommitted files exactly as they were, uncommitted', async () => {
		write(mine, 'README.md', '# design, edited\n');
		write(mine, 'projects/p/brief.md', '# P, edited\n');
		await syncRecords(mine);
		expect(onRemote('projects/p/brief.md')).toBe('# P, edited');
		expect(onRemote('README.md')).toBe('# design');
		expect(readFileSync(join(mine, 'README.md'), 'utf8')).toBe('# design, edited\n');
		expect(git(mine, 'status', '--porcelain')).toBe('M README.md');
	});

	it('does not take a file the person staged elsewhere into the records commit', async () => {
		write(mine, 'standards.md', 'x');
		git(mine, 'add', 'standards.md');
		write(mine, 'projects/p/brief.md', '# P, edited\n');
		await syncRecords(mine);
		expect(remoteHas('standards.md')).toBe(false);
		expect(git(mine, 'diff', '--cached', '--name-only')).toBe('standards.md');
	});
});

describe('when someone else has published too', () => {
	it("fits onto a teammate's work without a merge commit, and keeps both", async () => {
		write(theirs, 'projects/other/brief.md', '# Other\n');
		commitAll(theirs, 'teammate project');
		git(theirs, 'push', '-q', 'origin', 'HEAD:main');
		write(mine, 'projects/mine/brief.md', '# Mine\n');
		const r = await syncRecords(mine);
		expect(r.problems).toEqual([]);
		expect(onRemote('projects/other/brief.md')).toBe('# Other');
		expect(onRemote('projects/mine/brief.md')).toBe('# Mine');
		expect(git(mine, 'log', '--merges', '--format=%h')).toBe('');
		expect(existsSync(join(mine, 'projects/other/brief.md'))).toBe(true);
	});

	it('combines two people recording different iterations of one project, by meaning, not by lines', async () => {
		write(theirs, 'projects/p/iterations.json', `${JSON.stringify([record('i1'), record('i2', { contributors: [{ name: 'Teammate', login: 'tm' }] })], null, 2)}\n`);
		commitAll(theirs, 'teammate i2');
		git(theirs, 'push', '-q', 'origin', 'HEAD:main');
		write(mine, 'projects/p/iterations.json', `${JSON.stringify([record('i1', { commit: 'mine1' }), record('i3')], null, 2)}\n`);
		const r = await syncRecords(mine);
		expect(r).toEqual({ published: ['p'], problems: [] });
		const merged = JSON.parse(onRemote('projects/p/iterations.json')) as Array<{ name: string; commit?: string; contributors?: unknown }>;
		expect(merged.map((x) => x.name).sort()).toEqual(['i1', 'i2', 'i3']);
		expect(merged.find((x) => x.name === 'i1')?.commit).toBe('mine1');
		expect(merged.find((x) => x.name === 'i2')?.contributors).toEqual([{ name: 'Teammate', login: 'tm' }]);
		expect(git(mine, 'status', '--porcelain')).toBe('');
		expect(existsSync(join(mine, '.git', 'rebase-merge'))).toBe(false);
	});

	it('combines two people both creating the same new project, rather than failing on add/add', async () => {
		write(theirs, 'projects/shared/iterations.json', `${JSON.stringify([record('i1', { projectId: 'shared' })], null, 2)}\n`);
		commitAll(theirs, 'teammate shared');
		git(theirs, 'push', '-q', 'origin', 'HEAD:main');
		write(mine, 'projects/shared/iterations.json', `${JSON.stringify([record('i2', { projectId: 'shared' })], null, 2)}\n`);
		const r = await syncRecords(mine);
		expect(r.problems).toEqual([]);
		expect((JSON.parse(onRemote('projects/shared/iterations.json')) as Array<{ name: string }>).map((x) => x.name)).toEqual(['i1', 'i2']);
	});

	it("catches up with GitHub's records even when nothing local changed, so the tree stops being behind", async () => {
		write(theirs, 'projects/p/brief.md', '# P, by a teammate\n');
		commitAll(theirs, 'teammate edit');
		git(theirs, 'push', '-q', 'origin', 'HEAD:main');
		await syncRecords(mine);
		expect(readFileSync(join(mine, 'projects/p/brief.md'), 'utf8')).toBe('# P, by a teammate\n');
		expect(git(mine, 'status', '-sb').split('\n')[0]).not.toMatch(/behind/);
	});

	it("holds, and loses nothing, when two people changed the same brief, which only they can settle", async () => {
		write(theirs, 'projects/p/brief.md', '# P, teammate version\n');
		commitAll(theirs, 'teammate brief');
		git(theirs, 'push', '-q', 'origin', 'HEAD:main');
		write(mine, 'projects/p/brief.md', '# P, my version\n');
		const r = await syncRecords(mine);
		expect(r.published).toEqual([]);
		expect(r.problems[0]?.why).toMatch(/projects\/p\/brief\.md changed both here and on GitHub/);
		expect(r.problems[0]?.why).toMatch(/Nothing was lost/);
		expect(onRemote('projects/p/brief.md')).toBe('# P, teammate version'); // GitHub untouched
		expect(readFileSync(join(mine, 'projects/p/brief.md'), 'utf8')).toBe('# P, my version\n'); // mine intact, no markers
		expect(existsSync(join(mine, '.git', 'rebase-merge'))).toBe(false); // not left half-done
		expect(git(mine, 'diff', '--name-only', '--diff-filter=U')).toBe('');
	});
});

describe('what it refuses to publish', () => {
	it("will not push the person's own unpublished work along with the records, and says what is waiting", async () => {
		write(mine, 'workspace/app.ts', 'export {}');
		commitAll(mine, 'app change, not for auto-publishing');
		write(mine, 'projects/p/brief.md', '# P, edited\n');
		const r = await syncRecords(mine);
		expect(r.published).toEqual([]);
		expect(r.problems[0]?.why).toMatch(/workspace\/app\.ts/);
		expect(r.problems[0]?.why).toMatch(/Records are held back/);
		expect(remoteHas('workspace/app.ts')).toBe(false);
		expect(onRemote('projects/p/brief.md')).toBe('# P'); // not even the record went
		expect(git(mine, 'log', '-1', '--format=%s')).toBe('Update p'); // but it is saved, ready
	});

	it('publishes those records once the other work has been pushed by its owner', async () => {
		write(mine, 'workspace/app.ts', 'export {}');
		commitAll(mine, 'app change');
		write(mine, 'projects/p/brief.md', '# P, edited\n');
		await syncRecords(mine);
		git(mine, 'push', '-q', 'origin', 'HEAD:main'); // the person pushes their own work
		write(mine, 'projects/p/brief.md', '# P, edited again\n');
		expect((await syncRecords(mine)).problems).toEqual([]);
		expect(onRemote('projects/p/brief.md')).toBe('# P, edited again');
	});

	it('holds when the design repository is not tracking a branch on GitHub, saying how to fix it', async () => {
		git(mine, 'checkout', '-q', '-b', 'scratch');
		write(mine, 'projects/p/brief.md', '# P, edited\n');
		const r = await syncRecords(mine);
		expect(r.problems[0]?.why).toMatch(/not tracking a branch on GitHub.*git push -u origin scratch/);
		expect(remoteHas('scratch')).toBe(false);
	});

	it('holds when the branch tracks one with a different name, rather than publishing into it', async () => {
		git(mine, 'checkout', '-q', '-b', 'feature-x', 'origin/main');
		git(mine, 'branch', '-q', '-u', 'origin/main');
		write(mine, 'projects/p/brief.md', '# P, edited\n');
		expect((await syncRecords(mine)).problems[0]?.why).toMatch(/differently named branch/);
	});

	it('holds on a detached head', async () => {
		git(mine, 'checkout', '-q', '--detach');
		expect((await syncRecords(mine)).problems[0]?.why).toMatch(/not on a branch/);
	});
});

describe('a record that is not valid', () => {
	it('is never published, however it got that way, and the reason names the file', async () => {
		write(mine, 'projects/p/iterations.json', '[{"name": "i1", "branch": ');
		const r = await syncRecords(mine);
		expect(r.published).toEqual([]);
		expect(r.problems[0]?.why).toMatch(/projects\/p\/iterations\.json is not a valid record/);
		expect(JSON.parse(onRemote('projects/p/iterations.json'))[0].name).toBe('i1'); // GitHub's copy is still the good one
	});

	it('does not hold up a good project because another one is broken', async () => {
		write(mine, 'projects/broken/iterations.json', 'not json');
		write(mine, 'projects/fine/brief.md', '# Fine\n');
		const r = await syncRecords(mine);
		// One commit carries both, so the guard holds the whole push: nothing half-published, and the reason names the broken file.
		expect(r.problems[0]?.why).toMatch(/projects\/broken\/iterations\.json/);
		expect(remoteHas('projects/fine/brief.md')).toBe(false);
	});
});

describe('when GitHub cannot be reached', () => {
	it('keeps the records saved, says so, and publishes them on the next run', async () => {
		write(mine, 'projects/p/brief.md', '# P, edited offline\n');
		renameSync(remote, `${remote}.away`);
		const offline = await syncRecords(mine);
		expect(offline.published).toEqual([]);
		expect(offline.problems[0]?.why).toMatch(/Could not reach GitHub.*saved here/s);
		expect(git(mine, 'log', '-1', '--format=%s')).toBe('Update p');

		renameSync(`${remote}.away`, remote);
		const online = await syncRecords(mine);
		expect(online.problems).toEqual([]);
		expect(onRemote('projects/p/brief.md')).toBe('# P, edited offline');
	});

	it('does not make a second commit for the same change on a retry', async () => {
		write(mine, 'projects/p/brief.md', '# P, edited offline\n');
		renameSync(remote, `${remote}.away`);
		await syncRecords(mine);
		await syncRecords(mine);
		expect(git(mine, 'rev-list', '--count', 'origin/main..HEAD')).toBe('1');
	});
});

describe('safety', () => {
	it('never force-pushes: GitHub keeps what it had', async () => {
		const before = git(remote, 'rev-parse', 'main');
		write(mine, 'projects/p/brief.md', '# P, edited\n');
		await syncRecords(mine);
		expect(git(remote, 'merge-base', '--is-ancestor', before, 'main') ?? '').toBe('');
	});

	it('creates no branch on GitHub other than the one it tracks', async () => {
		write(mine, 'projects/p/brief.md', '# P, edited\n');
		await syncRecords(mine);
		expect(git(remote, 'for-each-ref', '--format=%(refname:short)', 'refs/heads')).toBe('main');
	});
});
