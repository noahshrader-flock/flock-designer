import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { freshTip, warmTip } from '../src/core/services/platform/fetch';
import { git } from '../src/core/services/platform/git';
import { eventually, g } from './fixtures';

let home: string;
let origin: string;
/** The person's clone, which nothing here may move. */
let mine: string;
/** Someone else's, who pushes. */
let other: string;

const commitIn = (dir: string, file: string, text: string) => {
	writeFileSync(join(dir, file), text);
	g(dir, 'add', file);
	g(dir, 'commit', '-q', '-m', `${file}: ${text}`);
	return g(dir, 'rev-parse', 'HEAD');
};

beforeEach(() => {
	home = mkdtempSync(join(tmpdir(), 'fdw-fresh-'));
	origin = join(home, 'origin.git');
	g(home, 'init', '-q', '--bare', '-b', 'develop', origin);
	other = join(home, 'other');
	g(home, 'clone', '-q', origin, other);
	g(other, 'checkout', '-q', '-b', 'develop');
	commitIn(other, 'a.txt', '1');
	g(other, 'push', '-q', '-u', 'origin', 'develop');
	mine = join(home, 'mine');
	g(home, 'clone', '-q', origin, mine);
});

afterEach(() => rmSync(home, { recursive: true, force: true }));

/** Everything of the person's a fetch must not touch: HEAD, every local branch, the index's bytes, the files, edits included. */
const theirs = () => ({
	head: g(mine, 'rev-parse', 'HEAD'),
	branch: g(mine, 'rev-parse', '--abbrev-ref', 'HEAD'),
	branches: g(mine, 'for-each-ref', '--format=%(refname) %(objectname)', 'refs/heads/'),
	index: createHash('sha256')
		.update(readFileSync(join(mine, '.git', 'index')))
		.digest('hex'),
	status: g(mine, 'status', '--porcelain', '--untracked-files=all'),
	edit: readFileSync(join(mine, 'a.txt'), 'utf8'),
	fetchHead: existsSync(join(mine, '.git', 'FETCH_HEAD')) ? readFileSync(join(mine, '.git', 'FETCH_HEAD'), 'utf8') : null,
});

/** A dirty checkout, as a person mid-work has: an edit, a staged file, an untracked one. */
const midWork = () => {
	writeFileSync(join(mine, 'a.txt'), 'my edit\n');
	writeFileSync(join(mine, 'staged.txt'), 'staged\n');
	g(mine, 'add', 'staged.txt');
	writeFileSync(join(mine, 'untracked.txt'), 'mine\n');
};

/** `freshTip`, with proof that the person's checkout is exactly as it was. */
const tipLeavingAlone = async (branch: string, options?: { waitMs?: number }) => {
	const before = theirs();
	const tip = await freshTip(mine, branch, options);
	expect(theirs()).toEqual(before);
	return tip;
};

describe('the tip to model work on', () => {
	it('is origin’s, with nothing to say, when the person’s branch is the same', async () => {
		midWork();
		expect(await tipLeavingAlone('develop')).toEqual({
			commit: g(origin, 'rev-parse', 'develop'),
			from: 'remote',
			standing: 'same',
			behind: 0,
			ahead: 0,
			said: null,
		});
	});

	it('is origin’s newer commit when the person is behind, fetched without moving their branch', async () => {
		midWork();
		const was = g(mine, 'rev-parse', 'develop');
		const newer = commitIn(other, 'b.txt', '2');
		commitIn(other, 'c.txt', '3');
		g(other, 'push', '-q');
		const tip = await tipLeavingAlone('develop');
		expect(tip).toMatchObject({ commit: g(origin, 'rev-parse', 'develop'), from: 'remote', standing: 'behind', behind: 2, ahead: 0 });
		expect(tip.said).toBe("Your local develop is 2 commits behind origin; origin's is used.");
		expect(g(mine, 'rev-parse', 'develop')).toBe(was);
		expect(g(mine, 'rev-parse', 'origin/develop')).not.toBe(newer);
	});

	it('is the person’s own when they are ahead: it holds everything origin has', async () => {
		const own = commitIn(mine, 'mine.txt', 'x');
		expect(await tipLeavingAlone('develop')).toMatchObject({ commit: own, from: 'local', standing: 'ahead', ahead: 1, behind: 0 });
	});

	it('is the person’s own when both moved, saying what origin has that it does not', async () => {
		const own = commitIn(mine, 'mine.txt', 'x');
		commitIn(other, 'b.txt', '2');
		g(other, 'push', '-q');
		const tip = await tipLeavingAlone('develop');
		expect(tip).toMatchObject({ commit: own, from: 'local', standing: 'diverged', ahead: 1, behind: 1 });
		expect(tip.said).toBe("Your develop and origin's have both moved; yours is used, and origin has 1 commit it does not include.");
	});

	it('reads a force-pushed origin as diverged, never as behind', async () => {
		g(other, 'commit', '-q', '--amend', '-m', 'rewritten');
		g(other, 'push', '-q', '--force');
		expect(await tipLeavingAlone('develop')).toMatchObject({ commit: g(mine, 'rev-parse', 'develop'), standing: 'diverged' });
	});

	it('is the local branch, plainly and fetching nothing, when it tracks nothing', async () => {
		g(mine, 'branch', 'only-here');
		const tip = await tipLeavingAlone('only-here');
		expect(tip).toMatchObject({ commit: g(mine, 'rev-parse', 'only-here'), from: 'local', standing: 'noUpstream' });
		expect(tip.said).toMatch(/tracks no branch DSNR can fetch/);
	});

	it('is the local branch in a repository with no remote at all', async () => {
		g(mine, 'remote', 'remove', 'origin');
		expect(await tipLeavingAlone('develop')).toMatchObject({ from: 'local', standing: 'noUpstream' });
	});

	it('uses a branch only on origin from origin, making nothing local', async () => {
		g(other, 'checkout', '-q', '-b', 'feature/zone');
		const tip0 = commitIn(other, 'z.txt', 'z');
		g(other, 'push', '-q', 'origin', 'feature/zone');
		g(mine, 'fetch', '-q');
		const tip = await tipLeavingAlone('feature/zone');
		expect(tip).toMatchObject({ commit: tip0, from: 'remote', standing: 'onlyOnRemote', said: null });
		expect(g(mine, 'branch', '--list', 'feature/zone')).toBe('');
	});

	it('follows the remote the branch tracks, whatever it is called', async () => {
		g(mine, 'remote', 'rename', 'origin', 'upstream');
		commitIn(other, 'b.txt', '2');
		g(other, 'push', '-q');
		const tip = await tipLeavingAlone('develop');
		expect(tip).toMatchObject({ commit: g(origin, 'rev-parse', 'develop'), standing: 'behind' });
		expect(tip.said).toContain('behind upstream');
	});

	it('fetches a remote copy this clone never had, as a single-branch clone lacks one', async () => {
		g(mine, 'update-ref', '-d', 'refs/remotes/origin/develop');
		expect(await tipLeavingAlone('develop')).toMatchObject({ commit: g(origin, 'rev-parse', 'develop'), standing: 'same' });
	});

	it('works while the person’s own git holds the index lock', async () => {
		commitIn(other, 'b.txt', '2');
		g(other, 'push', '-q');
		writeFileSync(join(mine, '.git', 'index.lock'), '');
		expect(await freshTip(mine, 'develop')).toMatchObject({ standing: 'behind' });
		expect(existsSync(join(mine, '.git', 'index.lock'))).toBe(true);
	});
});

describe('when origin cannot be read', () => {
	it('uses the local branch, saying so, when the branch is gone from origin', async () => {
		g(origin, 'update-ref', '-d', 'refs/heads/develop');
		const tip = await tipLeavingAlone('develop');
		expect(tip).toMatchObject({ commit: g(mine, 'rev-parse', 'develop'), from: 'local', standing: 'notFetched' });
		expect(tip.said).toBe('GitHub has no develop branch for mine. Your local develop is used.');
	});

	it('uses the local branch, with the reason, when the remote is not there, and quickly', async () => {
		g(mine, 'remote', 'set-url', 'origin', join(home, 'nowhere.git'));
		const started = Date.now();
		const tip = await tipLeavingAlone('develop');
		expect(Date.now() - started).toBeLessThan(2_000);
		expect(tip).toMatchObject({ from: 'local', standing: 'notFetched' });
		expect(tip.said).toMatch(/^Git could not update mine: .+ Your local develop is used\.$/);
	});

	it('goes ahead on the local branch when origin does not answer in time, holding up no other git command', async () => {
		// A remote that answers only after three seconds.
		g(mine, 'config', 'remote.origin.uploadpack', 'sleep 3 && git-upload-pack');
		const started = Date.now();
		const tip = await tipLeavingAlone('develop', { waitMs: 300 });
		expect(tip).toMatchObject({ from: 'local', standing: 'notFetched', said: 'origin did not answer within 1 seconds. Your local develop is used.' });
		await git(mine, ['rev-parse', 'HEAD']);
		expect(Date.now() - started).toBeLessThan(2_500);
	});
});

describe('one fetch for picking a branch and starting work', () => {
	it('uses the fetch started when the branch was picked, without fetching again', async () => {
		commitIn(other, 'b.txt', '2');
		g(other, 'push', '-q');
		warmTip(mine, 'develop');
		await eventually(() => expect(g(mine, 'rev-parse', 'origin/develop')).toBe(g(origin, 'rev-parse', 'develop')));
		// Origin moves again, but the fetch of a moment ago is the one used.
		commitIn(other, 'c.txt', '3');
		g(other, 'push', '-q');
		expect(await freshTip(mine, 'develop')).toMatchObject({ standing: 'behind', behind: 1 });
	});

	it('never throws from a warm start, whatever the branch', () => {
		expect(() => warmTip(mine, 'no-such-branch')).not.toThrow();
		expect(() => warmTip(mine, '--upload-pack=touch /tmp/x')).not.toThrow();
	});

	it('refuses a branch name that could be read as an option, and names one that is not there', async () => {
		await expect(freshTip(mine, '--upload-pack=x')).rejects.toThrow('is not a branch name DSNR can read');
		await expect(freshTip(mine, 'no-such-branch')).rejects.toThrow('There is no branch called no-such-branch in mine.');
	});
});
