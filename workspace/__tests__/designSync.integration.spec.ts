import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { syncRecords } from '../src/core/services/publishing/designSync';
import { g, madeOnce } from './fixtures';

/** Real repositories, not a mocked git: mocking git here would test the mock. */

let dir: string;
let remote: string;
let mine: string;
let theirs: string;
const onRemote = (path: string) => g(remote, 'show', `main:${path}`);
const remoteHas = (path: string) => {
	try {
		g(remote, 'cat-file', '-e', `main:${path}`);
		return true;
	} catch {
		return false;
	}
};
const write = (root: string, path: string, body: string) => {
	mkdirSync(join(root, path, '..'), { recursive: true });
	writeFileSync(join(root, path), body);
};
const record = (name: string, extra: Record<string, unknown> = {}) => ({
	projectId: 'p',
	name,
	branch: `prototype/p/${name}`,
	commit: null,
	createdAt: '2026-10-01T00:00:00Z',
	note: '',
	...extra,
});
const commitAll = (root: string, msg: string) => {
	g(root, 'add', '-A');
	g(root, 'commit', '-q', '-m', msg);
};

madeOnce((d) => {
	dir = d;
	remote = join(dir, 'remote.git');
	mine = join(dir, 'mine');
	theirs = join(dir, 'theirs');
	execFileSync('git', ['init', '-q', '--bare', '-b', 'main', remote]);
	for (const [name, who] of [
		['mine', 'Me'],
		['theirs', 'Teammate'],
	] as const) {
		const root = join(dir, name);
		execFileSync('git', ['clone', '-q', remote, root], { stdio: 'ignore' });
		g(root, 'config', 'user.email', `${name}@example.test`);
		g(root, 'config', 'user.name', who);
	}
	write(mine, '.gitignore', 'projects/*/comments.md\nprojects/*/comment-pictures/\n');
	write(mine, 'README.md', '# design\n');
	write(mine, 'projects/p/brief.md', '# P\n');
	write(mine, 'projects/p/work.json', `${JSON.stringify([record('v1')], null, 2)}\n`);
	commitAll(mine, 'base');
	g(mine, 'push', '-q', '-u', 'origin', 'HEAD:main');
	g(mine, 'branch', '-q', '-M', 'main');
	g(mine, 'branch', '-q', '-u', 'origin/main');
	g(theirs, 'pull', '-q', 'origin', 'main');
	g(theirs, 'branch', '-q', '-M', 'main');
	g(theirs, 'branch', '-q', '-u', 'origin/main');
});

describe('publishing records', () => {
	it('publishes a new project folder, and the tree is clean afterwards', async () => {
		write(mine, 'projects/new-view/brief.md', '# New view\n');
		write(mine, 'projects/new-view/context-receipt.md', 'receipt');
		write(mine, 'projects/new-view/work.json', `${JSON.stringify([record('codebase')], null, 2)}\n`);
		const r = await syncRecords(mine);
		expect(r).toEqual({ published: ['new-view'], problems: [] });
		expect(onRemote('projects/new-view/brief.md')).toBe('# New view');
		expect(g(mine, 'status', '--porcelain')).toBe('');
		expect(g(mine, 'rev-list', '--count', 'origin/main..HEAD')).toBe('0');
	});

	it('publishes a change to a record it already knew', async () => {
		write(mine, 'projects/p/work.json', `${JSON.stringify([record('v1', { commit: 'abc123' })], null, 2)}\n`);
		const r = await syncRecords(mine);
		expect(r.published).toEqual(['p']);
		expect(JSON.parse(onRemote('projects/p/work.json'))[0].commit).toBe('abc123');
		expect(g(remote, 'log', '-1', '--format=%s', 'main')).toBe('Update p');
	});

	it('does nothing, and makes no commit, when there is nothing to publish', async () => {
		const before = g(mine, 'rev-parse', 'HEAD');
		expect(await syncRecords(mine)).toEqual({ published: [], problems: [] });
		expect(g(mine, 'rev-parse', 'HEAD')).toBe(before);
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
		expect(g(mine, 'status', '--porcelain')).toBe('M README.md');
	});

	it('does not take a file the person staged elsewhere into the records commit', async () => {
		write(mine, 'standards.md', 'x');
		g(mine, 'add', 'standards.md');
		write(mine, 'projects/p/brief.md', '# P, edited\n');
		await syncRecords(mine);
		expect(remoteHas('standards.md')).toBe(false);
		expect(g(mine, 'diff', '--cached', '--name-only')).toBe('standards.md');
	});
});

describe('when someone else has published too', () => {
	it("never stashes the person's uncommitted edits, nor leaves them in a stash, when GitHub changed the same file", async () => {
		write(theirs, 'README.md', '# design, by a teammate\n');
		commitAll(theirs, 'teammate readme');
		g(theirs, 'push', '-q', 'origin', 'HEAD:main');
		write(mine, 'README.md', '# design, my edit\n');
		write(mine, 'projects/p/brief.md', '# P, edited\n');
		const before = g(mine, 'rev-parse', 'HEAD');
		const r = await syncRecords(mine);
		// The records still go; the person's branch stays where it was, since catching up would overwrite their edit.
		expect(r).toEqual({ published: ['p'], problems: [] });
		expect(onRemote('projects/p/brief.md')).toBe('# P, edited');
		expect(onRemote('README.md')).toBe('# design, by a teammate');
		expect(readFileSync(join(mine, 'README.md'), 'utf8')).toBe('# design, my edit\n');
		expect(g(mine, 'rev-parse', 'HEAD')).toBe(before);
		expect(g(mine, 'stash', 'list')).toBe('');
	});

	it('publishes once when asked twice at the same moment, and both runs end well', async () => {
		write(mine, 'projects/p/brief.md', '# P, edited\n');
		const base = g(remote, 'rev-parse', 'main');
		const [a, b] = await Promise.all([syncRecords(mine), syncRecords(mine)]);
		expect([a.problems, b.problems]).toEqual([[], []]);
		expect(g(remote, 'rev-list', '--count', `${base}..main`)).toBe('1');
		expect(g(mine, 'status', '--porcelain')).toBe('');
	});

	it("fits onto a teammate's work without a merge commit, and keeps both", async () => {
		write(theirs, 'projects/other/brief.md', '# Other\n');
		commitAll(theirs, 'teammate project');
		g(theirs, 'push', '-q', 'origin', 'HEAD:main');
		write(mine, 'projects/mine/brief.md', '# Mine\n');
		const r = await syncRecords(mine);
		expect(r.problems).toEqual([]);
		expect(onRemote('projects/other/brief.md')).toBe('# Other');
		expect(onRemote('projects/mine/brief.md')).toBe('# Mine');
		expect(g(mine, 'log', '--merges', '--format=%h')).toBe('');
		expect(existsSync(join(mine, 'projects/other/brief.md'))).toBe(true);
	});

	it('combines two people recording different versions of one project, by meaning, not by lines', async () => {
		write(
			theirs,
			'projects/p/work.json',
			`${JSON.stringify([record('v1'), record('v2', { contributors: [{ name: 'Teammate', login: 'tm' }] })], null, 2)}\n`,
		);
		commitAll(theirs, 'teammate i2');
		g(theirs, 'push', '-q', 'origin', 'HEAD:main');
		write(mine, 'projects/p/work.json', `${JSON.stringify([record('v1', { commit: 'mine1' }), record('v3')], null, 2)}\n`);
		const r = await syncRecords(mine);
		expect(r).toEqual({ published: ['p'], problems: [] });
		const merged = JSON.parse(onRemote('projects/p/work.json')) as Array<{ name: string; commit?: string; contributors?: unknown }>;
		expect(merged.map((x) => x.name).sort()).toEqual(['v1', 'v2', 'v3']);
		expect(merged.find((x) => x.name === 'v1')?.commit).toBe('mine1');
		expect(merged.find((x) => x.name === 'v2')?.contributors).toEqual([{ name: 'Teammate', login: 'tm' }]);
		expect(g(mine, 'status', '--porcelain')).toBe('');
		expect(existsSync(join(mine, '.git', 'rebase-merge'))).toBe(false);
	});

	it('combines two people both creating the same new project, rather than failing on add/add', async () => {
		write(theirs, 'projects/shared/work.json', `${JSON.stringify([record('v1', { projectId: 'shared' })], null, 2)}\n`);
		commitAll(theirs, 'teammate shared');
		g(theirs, 'push', '-q', 'origin', 'HEAD:main');
		write(mine, 'projects/shared/work.json', `${JSON.stringify([record('v2', { projectId: 'shared' })], null, 2)}\n`);
		const r = await syncRecords(mine);
		expect(r.problems).toEqual([]);
		expect((JSON.parse(onRemote('projects/shared/work.json')) as Array<{ name: string }>).map((x) => x.name)).toEqual(['v1', 'v2']);
	});

	it("catches up with GitHub's records even when nothing local changed, so the tree stops being behind", async () => {
		write(theirs, 'projects/p/brief.md', '# P, by a teammate\n');
		commitAll(theirs, 'teammate edit');
		g(theirs, 'push', '-q', 'origin', 'HEAD:main');
		await syncRecords(mine);
		expect(readFileSync(join(mine, 'projects/p/brief.md'), 'utf8')).toBe('# P, by a teammate\n');
		expect(g(mine, 'status', '-sb').split('\n')[0]).not.toMatch(/behind/);
	});

	it('holds, and loses nothing, when two people changed the same brief, which only they can settle', async () => {
		write(theirs, 'projects/p/brief.md', '# P, teammate version\n');
		commitAll(theirs, 'teammate brief');
		g(theirs, 'push', '-q', 'origin', 'HEAD:main');
		write(mine, 'projects/p/brief.md', '# P, my version\n');
		const r = await syncRecords(mine);
		expect(r.published).toEqual([]);
		expect(r.problems[0]?.why).toMatch(/projects\/p\/brief\.md changed both here and on GitHub/);
		expect(r.problems[0]?.why).toMatch(/Nothing was lost/);
		expect(onRemote('projects/p/brief.md')).toBe('# P, teammate version');
		expect(readFileSync(join(mine, 'projects/p/brief.md'), 'utf8')).toBe('# P, my version\n');
		expect(existsSync(join(mine, '.git', 'rebase-merge'))).toBe(false);
		expect(g(mine, 'diff', '--name-only', '--diff-filter=U')).toBe('');
	});
});

describe('a deleted project', () => {
	it('is deleted on GitHub too, and the tree is clean afterwards', async () => {
		write(mine, 'projects/gone/brief.md', '# Gone\n');
		write(mine, 'projects/gone/prototypes/v1.html', '<p>');
		await syncRecords(mine);
		expect(remoteHas('projects/gone/prototypes/v1.html')).toBe(true);
		rmSync(join(mine, 'projects/gone'), { recursive: true });
		expect(await syncRecords(mine)).toEqual({ published: ['gone'], problems: [] });
		expect(remoteHas('projects/gone/brief.md')).toBe(false);
		expect(remoteHas('projects/gone/prototypes/v1.html')).toBe(false);
		expect(g(mine, 'status', '--porcelain')).toBe('');
	});

	it('holds, and loses nothing, when a teammate changed it on GitHub meanwhile', async () => {
		write(mine, 'projects/kept/brief.md', '# Kept\n');
		await syncRecords(mine);
		g(theirs, 'pull', '-q', 'origin', 'main');
		write(theirs, 'projects/kept/brief.md', '# Kept, and changed\n');
		await syncRecords(theirs);
		rmSync(join(mine, 'projects/kept'), { recursive: true });
		const r = await syncRecords(mine);
		expect(r.published).toEqual([]);
		expect(r.problems[0]?.why).toContain('projects/kept/brief.md changed both here and on GitHub');
		expect(onRemote('projects/kept/brief.md')).toBe('# Kept, and changed');
	});
});

describe('what it refuses to publish', () => {
	it("will not push the person's own unpublished work along with the records, and says what is waiting", async () => {
		write(mine, 'workspace/app.ts', 'export {}');
		commitAll(mine, 'app change, not for auto-publishing');
		write(mine, 'projects/p/brief.md', '# P, edited\n');
		const r = await syncRecords(mine);
		expect(r.published).toEqual([]);
		// The files are a list of their own, in full, so a person can read them; the sentence says only how many and what to do.
		expect(r.problems[0]?.files).toEqual(['workspace/app.ts']);
		expect(r.problems[0]?.why).toMatch(/1 change outside the project records is waiting to be pushed/);
		expect(r.problems[0]?.why).not.toMatch(/workspace\/app\.ts/);
		expect(r.problems[0]?.why).toMatch(/Records are held back/);
		expect(remoteHas('workspace/app.ts')).toBe(false);
		expect(onRemote('projects/p/brief.md')).toBe('# P');
		expect(g(mine, 'log', '-1', '--format=%s')).toBe('app change, not for auto-publishing');
		expect(readFileSync(join(mine, 'projects/p/brief.md'), 'utf8')).toBe('# P, edited\n');
	});

	it("never rewrites the person's own commits, even when a teammate has published since", async () => {
		write(mine, 'workspace/app.ts', 'export {}');
		commitAll(mine, 'app change');
		const own = g(mine, 'rev-parse', 'HEAD');
		write(theirs, 'projects/other/brief.md', '# Other\n');
		commitAll(theirs, 'teammate project');
		g(theirs, 'push', '-q', 'origin', 'HEAD:main');
		write(mine, 'projects/p/brief.md', '# P, edited\n');
		expect((await syncRecords(mine)).problems[0]?.why).toMatch(/Records are held back/);
		expect(g(mine, 'rev-parse', 'HEAD')).toBe(own);
		expect(existsSync(join(mine, '.git', 'rebase-merge'))).toBe(false);
	});

	it('publishes those records once the other work has been pushed by its owner', async () => {
		write(mine, 'workspace/app.ts', 'export {}');
		commitAll(mine, 'app change');
		write(mine, 'projects/p/brief.md', '# P, edited\n');
		await syncRecords(mine);
		g(mine, 'push', '-q', 'origin', 'HEAD:main');
		write(mine, 'projects/p/brief.md', '# P, edited again\n');
		expect((await syncRecords(mine)).problems).toEqual([]);
		expect(onRemote('projects/p/brief.md')).toBe('# P, edited again');
	});

	it('holds when the design repository is not tracking a branch on GitHub, saying how to fix it', async () => {
		g(mine, 'checkout', '-q', '-b', 'scratch');
		write(mine, 'projects/p/brief.md', '# P, edited\n');
		const r = await syncRecords(mine);
		expect(r.problems[0]?.why).toMatch(/not tracking a branch on GitHub.*git push -u origin scratch/);
		expect(remoteHas('scratch')).toBe(false);
	});

	it('holds when the branch tracks one with a different name, rather than publishing into it', async () => {
		g(mine, 'checkout', '-q', '-b', 'feature-x', 'origin/main');
		g(mine, 'branch', '-q', '-u', 'origin/main');
		write(mine, 'projects/p/brief.md', '# P, edited\n');
		expect((await syncRecords(mine)).problems[0]?.why).toMatch(/differently named branch/);
	});

	it('holds on a detached head', async () => {
		g(mine, 'checkout', '-q', '--detach');
		expect((await syncRecords(mine)).problems[0]?.why).toMatch(/not on a branch/);
	});
});

describe('a record that is not valid', () => {
	it('is never published, however it got that way, and the reason names the file', async () => {
		write(mine, 'projects/p/work.json', '[{"name": "v1", "branch": ');
		const r = await syncRecords(mine);
		expect(r.published).toEqual([]);
		expect(r.problems[0]?.why).toMatch(/projects\/p\/work\.json is not a valid record/);
		expect(JSON.parse(onRemote('projects/p/work.json'))[0].name).toBe('v1');
	});

	it('does not hold up a good project because another one is broken', async () => {
		write(mine, 'projects/broken/work.json', 'not json');
		write(mine, 'projects/fine/brief.md', '# Fine\n');
		const r = await syncRecords(mine);
		// One commit carries both, so the guard holds the whole push: nothing half-published, and the reason names the broken file.
		expect(r.problems[0]?.why).toMatch(/projects\/broken\/work\.json/);
		expect(remoteHas('projects/fine/brief.md')).toBe(false);
	});
});

describe('when GitHub cannot be reached', () => {
	it('keeps the records saved, says so, and publishes them on the next run', async () => {
		write(mine, 'projects/p/brief.md', '# P, edited offline\n');
		renameSync(remote, `${remote}.away`);
		const offline = await syncRecords(mine);
		expect(offline.published).toEqual([]);
		expect(offline.problems[0]?.why).toMatch(/Could not reach GitHub.*kept here/s);
		expect(readFileSync(join(mine, 'projects/p/brief.md'), 'utf8')).toBe('# P, edited offline\n');

		renameSync(`${remote}.away`, remote);
		const online = await syncRecords(mine);
		expect(online.problems).toEqual([]);
		expect(onRemote('projects/p/brief.md')).toBe('# P, edited offline');
	});

	it("adds nothing to the person's branch while it waits", async () => {
		write(mine, 'projects/p/brief.md', '# P, edited offline\n');
		renameSync(remote, `${remote}.away`);
		await syncRecords(mine);
		await syncRecords(mine);
		expect(g(mine, 'rev-list', '--count', 'origin/main..HEAD')).toBe('0');
	});
});

describe('safety', () => {
	it('never force-pushes: GitHub keeps what it had', async () => {
		const before = g(remote, 'rev-parse', 'main');
		write(mine, 'projects/p/brief.md', '# P, edited\n');
		await syncRecords(mine);
		expect(g(remote, 'merge-base', '--is-ancestor', before, 'main') ?? '').toBe('');
	});

	it('creates no branch on GitHub other than the one it tracks', async () => {
		write(mine, 'projects/p/brief.md', '# P, edited\n');
		await syncRecords(mine);
		expect(g(remote, 'for-each-ref', '--format=%(refname:short)', 'refs/heads')).toBe('main');
	});
});
