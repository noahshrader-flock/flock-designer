import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PublishProblem } from '../../shared/contract';
import { plural } from '../../shared/plural';
import { mergeWorkRecords } from '../../shared/workRecords';
import { commitOnto, git } from './git';
import { errorText } from '../../shared/result';
import { HOST } from '../../shared/vocabulary';
import { workPath } from '../../shared/designPaths';

/**
 * Keeping the design repository's project records published, with nobody having to remember.
 *
 * **One writer.** Records used to be written into this clone *and* committed to GitHub through its
 * API, so the clone could never catch up: git refuses to fast-forward over a file that already matches
 * what is coming in, which left the tree dirty and `git pull` stuck. Now there is one copy of each
 * change, published from here.
 *
 * **Only the records, and never the person's work.** The records commit is made on top of what GitHub has, in a
 * temporary index, and pushed: the person's branch, index and files are never rebased or stashed. Their branch is then
 * fast-forwarded to it, which git does only when the branch has nothing of its own and their edits are not in the way. When
 * it has commits of its own, records wait (they would land on GitHub but stay uncommitted here, and the person's next
 * `git pull` would refuse); what is held back is said, with why.
 *
 * **Never destructive.** Plain pushes only; a combination it cannot make is abandoned with the records left as they are
 * here, and the next run tries again. Two runs at once (the app's publisher, a page deploy, the `dsnr` command in
 * another process) need no lock: each builds on what GitHub has, and the second's push is refused, builds again, and
 * finds nothing left to do.
 */

export type Problem = PublishProblem;

export interface SyncResult {
	/** Project ids whose changes reached GitHub in this run. */
	published: string[];
	problems: Problem[];
}

const RECORDS = 'Project records';
/** A project's records file, as `workPath` names it: the one file a sync merges by meaning. */
const isRecordFile = (f: string): boolean => f === workPath(f.split('/')[1] ?? '');
const lines = (out: string): string[] => out.split('\n').filter(Boolean);
/** The first line of what git said: enough to act on, without a wall of its output. */
const message = (err: unknown): string => errorText(err, { firstLine: true });

export const syncRecords = async (designRoot: string): Promise<SyncResult> => {
	const g = (...args: string[]) => git(designRoot, args, { timeoutMs: 120_000 });
	const held = (why: string, files?: string[]): SyncResult => ({ published: [], problems: [{ what: RECORDS, why, files }] });

	// Where this is going. Without a branch that tracks the same-named branch on GitHub there is nowhere safe to put records.
	const branch = await g('rev-parse', '--abbrev-ref', 'HEAD').catch(() => 'HEAD');
	if (branch === 'HEAD') return held('The design repository is not on a branch, so records have nowhere to go.');
	let upstream: string;
	try {
		upstream = await g('rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}');
	} catch {
		return held(`The design repository's branch ${branch} is not tracking a branch on ${HOST}. Run "git push -u origin ${branch}" in it once.`);
	}
	if (!upstream.endsWith(`/${branch}`)) {
		return held(`${branch} tracks ${upstream}, a differently named branch, so records are not published into it.`);
	}
	const remote = upstream.slice(0, upstream.length - branch.length - 1);

	for (let attempt = 0; ; attempt++) {
		try {
			await g('fetch', '-q', remote, branch);
		} catch (err) {
			return held(`Could not reach ${HOST}, so the records are kept here and will be published when it can: ${message(err)}`);
		}
		const theirs = await g('rev-parse', upstream);

		// The person's own commits are theirs to publish: until they have, records wait, and nothing here is touched.
		const outside = lines(await g('diff', '--name-only', `${theirs}...HEAD`)).filter((f) => !f.startsWith('projects/'));
		if (outside.length > 0) {
			return held(
				`${plural(outside.length, 'change')} outside the project records ${outside.length === 1 ? 'is' : 'are'} waiting to be pushed. Records are held back; push ${outside.length === 1 ? 'it' : 'those'} yourself, and records will flow again.`,
				outside,
			);
		}

		const made = await recordsOnTopOf(designRoot, theirs);
		if (typeof made === 'string') return held(made);
		const { commit, ids, paths, read } = made;
		if (commit === null) {
			await catchUp(designRoot, theirs, paths, read);
			return { published: [], problems: [] };
		}
		try {
			await g('push', '-q', remote, `${commit}:refs/heads/${branch}`);
		} catch (err) {
			// GitHub moved in the meantime (another run, a teammate): build again on what it has now, once.
			if (attempt === 0) continue;
			return held(`Could not publish the records: ${message(err)}`);
		}
		await g('update-ref', `refs/remotes/${upstream}`, commit).catch(() => undefined);
		await catchUp(designRoot, commit, paths, read);
		return { published: ids, problems: [] };
	}
};

/**
 * This machine's record changes (what `projects/` has here against where this branch and GitHub's last met), as a commit
 * on GitHub's: made in a temporary index, so nothing of the person's is touched. A file changed on both sides is an
 * ordinary case for `work.json` (two people recording versions of one project) and is merged by meaning; any
 * other is a real disagreement between people, which only they can settle. A string says what to tell the person.
 */
const recordsOnTopOf = async (
	designRoot: string,
	theirs: string,
): Promise<string | { commit: string | null; ids: string[]; paths: string[]; read: Map<string, string | null> }> => {
	const g = (args: string[], input?: string) => git(designRoot, args, { input });
	const blobAt = (rev: string, path: string) => g(['rev-parse', '-q', '--verify', `${rev}:${path}`]).catch(() => null);
	const base = await g(['merge-base', 'HEAD', theirs]).catch(() => null);
	if (base === null) return `The design repository here and on ${HOST} share no history, so records are not published into it.`;

	const paths = [
		...new Set([
			...lines(await g(['diff', '--name-only', '--no-renames', base, '--', 'projects'])),
			...lines(await g(['ls-files', '--others', '--exclude-standard', '--', 'projects'])),
		]),
	].sort();
	// What is published for each file: its blob, or null when it is deleted.
	const changes = new Map<string, string | null>();
	const hopeless: string[] = [];
	const read = new Map<string, string | null>();
	for (const path of paths) {
		const here = existsSync(join(designRoot, path)) ? await g(['hash-object', '-w', '--', path]) : null;
		read.set(path, here);
		const there = await blobAt(theirs, path);
		if (here === there) continue;
		if (there === (await blobAt(base, path))) {
			changes.set(path, here);
			continue;
		}
		if (!isRecordFile(path) || here === null || there === null) {
			hopeless.push(path);
			continue;
		}
		const merged = mergeWorkRecords(
			readFileSync(join(designRoot, path), 'utf8'),
			await git(designRoot, ['show', `${theirs}:${path}`], { trim: false }),
		);
		if (merged === null) return `${path} could not be combined with ${HOST}'s copy, so nothing was changed. Your changes are kept here.`;
		changes.set(path, await g(['hash-object', '-w', '--stdin'], merged));
	}
	if (hopeless.length > 0) {
		return `${hopeless.join(', ')} changed both here and on ${HOST}, and git cannot tell which to keep. Nothing was lost: your changes are kept here. Combine them in the design repository, then records will flow again.`;
	}
	if (changes.size === 0) return { commit: null, ids: [], paths, read };

	// A record that does not parse must never be published: every reviewer's project list reads these.
	for (const [path, blob] of changes) {
		if (!isRecordFile(path) || blob === null) continue;
		const text = await git(designRoot, ['cat-file', 'blob', blob], { trim: false });
		if (mergeWorkRecords(text, text) === null) {
			return `${path} is not a valid record, so nothing was published. Fix it in the design repository, and records will flow again.`;
		}
	}

	const ids = [...new Set([...changes.keys()].map((p) => /^projects\/([^/]+)\//.exec(p)?.[1]).filter((x): x is string => Boolean(x)))].sort();
	try {
		const commit = await commitOnto(designRoot, theirs, theirs, changes, `Update ${ids.join(', ')}`);
		return commit === null ? { commit: null, ids: [], paths, read } : { commit, ids, paths, read };
	} catch (err) {
		return `Could not save the project records: ${message(err)}. Git needs a name and email (git config user.name, user.email).`;
	}
};

/**
 * Brings the person's branch up to `target` when it has nothing of its own, so the tree stops being behind. A record
 * merged with GitHub's is written here first, only if it is still as it was read (`read`): one written since is newer,
 * and is left for the next run. The records are then staged, so git can
 * move over them, and git itself refuses when anything else of the person's would be overwritten. Then nothing moves.
 */
const catchUp = async (designRoot: string, target: string, paths: string[], read: Map<string, string | null>): Promise<void> => {
	const g = (...args: string[]) => git(designRoot, args);
	if ((await g('rev-parse', 'HEAD')) === target) return;
	for (const path of paths.filter(isRecordFile)) {
		const file = join(designRoot, path);
		const there = await g('rev-parse', '-q', '--verify', `${target}:${path}`).catch(() => null);
		const now = existsSync(file) ? await g('hash-object', '--', path) : null;
		if (now === null || there === null || now === there || now !== read.get(path)) continue;
		writeFileSync(file, await git(designRoot, ['show', `${target}:${path}`], { trim: false }));
	}
	if (paths.length > 0) await g('add', '-A', '--', ...paths).catch(() => undefined);
	try {
		await g('merge', '--ff-only', '-q', target);
	} catch {
		if (paths.length > 0) await g('reset', '-q', '--', ...paths).catch(() => undefined);
	}
};
