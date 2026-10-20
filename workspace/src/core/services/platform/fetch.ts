import { basename, resolve } from 'node:path';
import { errorText } from '../../../shared/result';
import { CLI, HOST } from '../../../shared/vocabulary';
import { plural } from '../../../shared/plural';
import { branchTip, git, isSafeBranchName, refTip } from './git';
import { within } from './within';

/** A failed fetch in words, for `what` it was fetching (the library, a product). */
export const fetchProblem = (stderr: string, branch: string, what: string): string => {
	if (
		/Authentication failed|could not read (Username|Password)|terminal prompts disabled|Repository not found|Permission denied \(publickey\)|403/i.test(
			stderr,
		)
	) {
		return `${HOST} would not let git on this computer read ${what}: git is not signed in to ${HOST}, or this account cannot read it. Run \`${CLI} auth setup-git\` in a terminal (with ${HOST}'s command line signed in), or sign in to git.`;
	}
	if (
		/Could not resolve host|Failed to connect|Connection (timed out|refused|reset)|Network is unreachable|unable to access|timed out|SIGTERM/i.test(
			stderr,
		)
	) {
		return `Could not reach ${HOST}. Check the internet connection.`;
	}
	if (/couldn't find remote ref|no such ref/i.test(stderr)) return `${HOST} has no ${branch} branch for ${what}.`;
	const said =
		stderr
			.trim()
			.split('\n')
			.pop()
			?.replace(/^fatal:\s*/, '') ?? '';
	return `Git could not update ${what}: ${said || 'it stopped without saying why.'}`;
};

/**
 * Where the person's branch stands against its copy on its remote. `onlyOnRemote`: there is no local branch, so the remote's
 * is used and nothing is made local. `noUpstream`: it tracks nothing, so there is nothing to fetch, and that is no failure.
 * `notFetched`: it has an upstream, but the fetch failed or did not finish in time.
 */
export type Standing = 'same' | 'behind' | 'ahead' | 'diverged' | 'onlyOnRemote' | 'noUpstream' | 'notFetched';

export interface FreshTip {
	/** The commit to model on. */
	commit: string;
	/** Whose tip it is: the remote's copy (fetched just now, unless `notFetched` said otherwise), or the person's branch. */
	from: 'remote' | 'local';
	standing: Standing;
	/** Commits the remote has that the tip does not, and the person's that the remote does not: 0 where not known. */
	behind: number;
	ahead: number;
	/** What the person is told, in words; null when the tip is simply the remote's latest. */
	said: string | null;
}

/** A person may set any name, but only one that cannot be read as an option or a path is given to git. */
const isSafeRemoteName = (name: string): boolean => /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name);

/** A remote, a branch's ref there, and the ref this clone keeps its copy in. */
export interface RemoteCopy {
	remote: string;
	remoteRef: string;
	trackingRef: string;
}

/** Null when it tracks nothing, or another local branch (`remote = .`). Read even when that copy was never fetched. */
const upstreamOf = async (root: string, branch: string): Promise<RemoteCopy | null> => {
	const out = await git(root, ['for-each-ref', '--format=%(upstream)%09%(upstream:remotename)%09%(upstream:remoteref)', `refs/heads/${branch}`]);
	const [trackingRef = '', remote = '', remoteRef = ''] = out.split('\t');
	return trackingRef.startsWith('refs/remotes/') && remoteRef.startsWith('refs/heads/') ? { remote, remoteRef, trackingRef } : null;
};

/**
 * Updates one remote copy and nothing else (an explicit refspec; no tags, submodules, `FETCH_HEAD`, gc or prompt), so the
 * person's branches, index and files are never touched. It does not queue behind DSNR's other git commands, taking none of
 * their locks: a remote that never answers holds up only itself. Null when it fetched; else why not, for `what`.
 */
export const fetchRemoteCopy = (
	root: string,
	{ remote, remoteRef, trackingRef }: RemoteCopy,
	{ timeoutMs, what, branch }: { timeoutMs: number; what: string; branch: string },
): Promise<string | null> =>
	git(
		root,
		[
			'fetch',
			'--quiet',
			'--no-tags',
			'--no-recurse-submodules',
			'--no-write-fetch-head',
			'--no-auto-gc',
			'--no-auto-maintenance',
			'--',
			remote,
			`+${remoteRef}:${trackingRef}`,
		],
		{ timeoutMs, env: { GCM_INTERACTIVE: 'never' }, queued: false },
	).then(
		() => null,
		(err: unknown) => fetchProblem(errorText(err), branch, what),
	);

/** How long a fetch for work about to start may run before it is stopped. */
const FETCH_TIMEOUT_MS = 20_000;
/** A fetch this recent is used again, so one started when a branch was picked is the one used when work starts. */
const FRESH_FOR_MS = 60_000;
/** How long starting work waits for a fetch before going ahead on what this clone already has, and saying so. */
const WAIT_MS = 3_000;

const fetches = new Map<string, { at: number; settled: boolean; done: Promise<string | null> }>();

/**
 * `fetchRemoteCopy`, shared with any fetch of the same copy still running, or one that worked within `maxAgeMs`; a failure
 * is not kept, so the next asks again.
 */
const fetchOnce = (root: string, branch: string, copy: RemoteCopy, maxAgeMs: number): Promise<string | null> => {
	const key = `${resolve(root)}\0${copy.trackingRef}`;
	const known = fetches.get(key);
	if (known && (!known.settled || Date.now() - known.at < maxAgeMs)) return known.done;
	const done = fetchRemoteCopy(root, copy, { timeoutMs: FETCH_TIMEOUT_MS, what: basename(root), branch });
	const entry = { at: Date.now(), settled: false, done };
	fetches.set(key, entry);
	void done.then((failed) => {
		entry.settled = true;
		if (failed !== null && fetches.get(key) === entry) fetches.delete(key);
	});
	return done;
};

const counts = async (root: string, local: string, remote: string): Promise<{ ahead: number; behind: number }> => {
	const [ahead = 0, behind = 0] = (await git(root, ['rev-list', '--left-right', '--count', `${local}...${remote}`])).split(/\s+/).map(Number);
	return { ahead, behind };
};

/** For a branch only on a remote: the one remote that has it. */
const remoteOnly = async (root: string, branch: string): Promise<RemoteCopy | null> => {
	const refs = (await git(root, ['for-each-ref', '--format=%(refname)', `refs/remotes/*/${branch}`])).split('\n').filter(Boolean);
	const [only] = refs;
	if (refs.length !== 1 || only === undefined) return null;
	const remote = only.slice('refs/remotes/'.length, -(branch.length + 1));
	return { remote, remoteRef: `refs/heads/${branch}`, trackingRef: only };
};

/** The branch here and what it fetches from; `untracked`: it tracks nothing DSNR can fetch. Only on a remote: that remote's. */
type Where = { untracked: true; local: string } | { untracked: false; local: string | null; upstream: RemoteCopy };

const whereIs = async (root: string, branch: string): Promise<Where> => {
	if (!isSafeBranchName(branch)) throw new Error(`${branch} is not a branch name DSNR can read.`);
	const usable = (u: RemoteCopy | null): RemoteCopy | null => (u !== null && isSafeRemoteName(u.remote) ? u : null);
	const local = await branchTip(root, branch);
	const upstream = usable(local === null ? await remoteOnly(root, branch) : await upstreamOf(root, branch));
	if (upstream !== null) return { untracked: false, local, upstream };
	if (local === null) throw new Error(`There is no branch called ${branch} in ${basename(root)}.`);
	return { untracked: true, local };
};

/**
 * Fetches `branch`, then says which commit to model work on: the remote's when the person's branch has nothing of its own;
 * the person's when it is ahead or diverged (their working branch), saying what the remote has beyond it; the local branch
 * when it tracks nothing or the fetch failed. **Moves nothing of theirs.** `waitMs`: how long to wait for the fetch, which goes on after.
 */
export const freshTip = async (root: string, branch: string, { waitMs = WAIT_MS }: { waitMs?: number } = {}): Promise<FreshTip> => {
	const where = await whereIs(root, branch);
	if (where.untracked)
		return {
			commit: where.local,
			from: 'local',
			standing: 'noUpstream',
			behind: 0,
			ahead: 0,
			said: `${branch} tracks no branch DSNR can fetch, so it is used as it is here.`,
		};
	const { local, upstream } = where;
	// Wrapped, since a fetch that worked answers null too.
	const fetched = await within(
		waitMs,
		fetchOnce(root, branch, upstream, FRESH_FOR_MS).then((failed) => ({ failed })),
	);
	const failed = fetched === null ? `${upstream.remote} did not answer within ${Math.max(1, Math.round(waitMs / 1000))} seconds.` : fetched.failed;
	const remote = await refTip(root, upstream.trackingRef);

	if (local === null) {
		// Nothing of the person's to fall back on: the remote's copy as this clone last had it, said.
		if (remote === null) throw new Error(failed ?? `There is no branch called ${branch} in ${basename(root)}.`);
		return {
			commit: remote,
			from: 'remote',
			standing: 'onlyOnRemote',
			behind: 0,
			ahead: 0,
			said: failed && `${failed} ${branch} is used as this computer last fetched it.`,
		};
	}
	if (failed !== null || remote === null)
		return {
			commit: local,
			from: 'local',
			standing: 'notFetched',
			behind: 0,
			ahead: 0,
			said: `${failed ?? `${upstream.remote} has no ${branch}.`} Your local ${branch} is used.`,
		};

	const { ahead, behind } = await counts(root, local, remote);
	if (ahead === 0 && behind === 0) return { commit: remote, from: 'remote', standing: 'same', behind, ahead, said: null };
	if (ahead === 0)
		return {
			commit: remote,
			from: 'remote',
			standing: 'behind',
			behind,
			ahead,
			said: `Your local ${branch} is ${plural(behind, 'commit')} behind ${upstream.remote}; ${upstream.remote}'s is used.`,
		};
	if (behind === 0)
		return {
			commit: local,
			from: 'local',
			standing: 'ahead',
			behind,
			ahead,
			said: `Your ${branch} has ${plural(ahead, 'commit')} not on ${upstream.remote} yet; yours is used.`,
		};
	return {
		commit: local,
		from: 'local',
		standing: 'diverged',
		behind,
		ahead,
		said: `Your ${branch} and ${upstream.remote}'s have both moved; yours is used, and ${upstream.remote} has ${plural(behind, 'commit')} it does not include.`,
	};
};

/**
 * Fetches `branch`'s remote copy now, and waits for it: for a commit this clone lacks, so an earlier fetch is not enough,
 * though one still running is shared. Null when it fetched, or the branch tracks nothing; else why not, in words.
 */
export const fetchBranch = async (root: string, branch: string): Promise<string | null> => {
	const where = await whereIs(root, branch);
	return where.untracked ? null : fetchOnce(root, branch, where.upstream, 0);
};

/** Starts the fetch `freshTip` will use, when the branch is picked: never throws, and nothing waits on it. */
export const warmTip = (root: string, branch: string): void => {
	void fetchBranch(root, branch).catch(() => undefined);
};
