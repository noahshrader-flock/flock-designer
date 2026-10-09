import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PublishProblem } from '../../shared/contract';
import { plural } from '../../shared/plural';
import { mergeIterationRecords } from '../../shared/records';
import { runGit } from './git';

/**
 * Keeping the design repository's project records published, with nobody having to remember.
 *
 * **One writer.** Records used to be written into this clone *and* committed to GitHub through its
 * API, so the clone could never catch up: git refuses to fast-forward over a file that already matches
 * what is coming in, which left the tree dirty and `git pull` stuck. Now there is one copy of each
 * change. It is committed here, fitted onto whatever GitHub has, and pushed.
 *
 * **Only the records.** It touches `projects/` and nothing else, and it refuses to push if anything
 * else is waiting to go, because pushing a branch pushes every commit on it, and the person's own work
 * on the repository (the app, the plan) is theirs to publish. What is held back is said, with why.
 *
 * **Never destructive.** Plain pushes only; a combination it cannot make is abandoned with the
 * person's work intact (the local commit stays, and the next run tries again); other uncommitted files
 * are set aside and put back, never committed.
 */

export type Problem = PublishProblem;

export interface SyncResult {
	/** Project ids whose changes reached GitHub in this run. */
	published: string[];
	problems: Problem[];
}

const RECORDS = 'Project records';
const isRecordFile = (f: string): boolean => /^projects\/[^/]+\/iterations\.json$/.test(f);
const lines = (out: string): string[] => out.split('\n').filter(Boolean);
/** The first line of what git said: enough to act on, without a wall of its output. */
const message = (err: unknown): string => (err instanceof Error ? err.message : String(err)).trim().split('\n')[0] ?? '';

export const syncRecords = async (designRoot: string): Promise<SyncResult> => {
	const g = (...args: string[]) => runGit(designRoot, args, 120_000);
	const held = (why: string, published: string[] = []): SyncResult => ({ published, problems: [{ what: RECORDS, why }] });

	// Where this is going. Without a branch that tracks the same-named branch on GitHub there is nowhere safe to put records.
	const branch = await g('rev-parse', '--abbrev-ref', 'HEAD').catch(() => 'HEAD');
	if (branch === 'HEAD') return held('The design repository is not on a branch, so records have nowhere to go.');
	let upstream: string;
	try {
		upstream = await g('rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}');
	} catch {
		return held(`The design repository's branch ${branch} is not tracking a branch on GitHub. Run "git push -u origin ${branch}" in it once.`);
	}
	if (!upstream.endsWith(`/${branch}`)) {
		return held(`${branch} tracks ${upstream}, a differently named branch, so records are not published into it.`);
	}
	const remote = upstream.slice(0, upstream.length - branch.length - 1);

	// 1. Whatever changed under projects/ becomes one local commit, limited to those paths.
	const changed = lines(await g('status', '--porcelain', '--untracked-files=all', '--', 'projects'));
	const ids = [...new Set(changed.map((l) => /projects\/([^/]+)\//.exec(l)?.[1]).filter((x): x is string => Boolean(x)))].sort();
	if (ids.length > 0) {
		try {
			await g('add', '-A', '--', 'projects');
			await g('commit', '-q', '-m', `Update ${ids.join(', ')}`, '--', 'projects');
		} catch (err) {
			await g('reset', '-q', '--', 'projects').catch(() => undefined);
			return held(`Could not save the project records: ${message(err)}. Git needs a name and email (git config user.name, user.email).`);
		}
	}

	// 2. Fit onto what GitHub has now.
	try {
		await g('fetch', '-q', remote, branch);
	} catch (err) {
		return held(`Could not reach GitHub, so the records are saved here and will be published when it can: ${message(err)}`);
	}
	if (Number(await g('rev-list', '--count', `HEAD..${upstream}`)) > 0) {
		const problem = await integrate(designRoot, upstream);
		if (problem) return held(problem);
	}

	// 3. Only records may go. Anything else waiting is the person's own to publish.
	const waiting = Number(await g('rev-list', '--count', `${upstream}..HEAD`));
	if (waiting === 0) return { published: [], problems: [] };
	const outside = lines(await g('diff', '--name-only', `${upstream}..HEAD`)).filter((f) => !f.startsWith('projects/'));
	if (outside.length > 0) {
		return held(
			`${plural(outside.length, 'change')} outside the project records (${outside.slice(0, 3).join(', ')}${outside.length > 3 ? ', …' : ''}) are waiting to be pushed, and a push would carry them. Records are held back; push those yourself, and records will flow again.`,
		);
	}

	// A record that does not parse must never be published: a textual merge of two edits can in principle make
	// one, and every reviewer's project list reads these.
	for (const file of lines(await g('diff', '--name-only', `${upstream}..HEAD`)).filter(isRecordFile)) {
		const text = await g('show', `HEAD:${file}`).catch(() => null);
		if (text !== null && mergeIterationRecords(text, text) === null) {
			return held(`${file} is not a valid record, so nothing was published. Fix it in the design repository, and records will flow again.`);
		}
	}

	// 4. Push. If GitHub moved in the meantime, fit once more and try once more.
	for (let attempt = 0; ; attempt++) {
		try {
			await g('push', '-q', remote, `HEAD:refs/heads/${branch}`);
			return { published: ids, problems: [] };
		} catch (err) {
			if (attempt === 1) return held(`Could not publish the records: ${message(err)}`);
			try {
				await g('fetch', '-q', remote, branch);
				const problem = await integrate(designRoot, upstream);
				if (problem) return held(problem);
			} catch (inner) {
				return held(`Could not publish the records: ${message(inner)}`);
			}
		}
	}
};

/**
 * Replays this machine's record commits onto GitHub's. A conflict in a project's `iterations.json` is
 * the ordinary case (two people recording iterations of one project) and is merged by meaning; any
 * other conflict is a real disagreement between people, so the attempt is abandoned and nothing is lost.
 * Returns null on success, or what to tell the person.
 */
const integrate = async (designRoot: string, upstream: string): Promise<string | null> => {
	const g = (args: string[], env?: Record<string, string>) => runGit(designRoot, args, 60_000, env);
	const abandon = async (why: string): Promise<string> => {
		await g(['rebase', '--abort']).catch(() => undefined);
		return why;
	};

	try {
		await g(['rebase', '--autostash', upstream]);
		return null;
	} catch (first) {
		let failure: unknown = first;
		for (let round = 0; round < 25; round++) {
			const unmerged = lines(await g(['diff', '--name-only', '--diff-filter=U']).catch(() => ''));
			if (unmerged.length === 0) return abandon(`Could not combine your changes with GitHub's: ${message(failure)}`);
			const hopeless = unmerged.filter((f) => !isRecordFile(f));
			if (hopeless.length > 0) {
				return abandon(`${hopeless.join(', ')} changed both here and on GitHub, and git cannot tell which to keep. Nothing was lost: your changes are saved here. Combine them in the design repository, then records will flow again.`);
			}
			for (const file of unmerged) {
				// During a rebase, stage 2 is what GitHub has and stage 3 is the change being replayed (this machine's).
				const theirs = await g(['show', `:2:${file}`]).catch(() => null);
				const mine = await g(['show', `:3:${file}`]).catch(() => null);
				const merged = theirs !== null && mine !== null ? mergeIterationRecords(mine, theirs) : null;
				if (merged === null) return abandon(`${file} could not be combined with GitHub's copy, so nothing was changed. Your changes are saved here.`);
				writeFileSync(join(designRoot, file), merged);
				await g(['add', '--', file]);
			}
			try {
				await g(['rebase', '--continue'], { GIT_EDITOR: 'true' });
				return null;
			} catch (next) {
				failure = next; // the next commit being replayed may conflict too
			}
		}
		return abandon("Could not combine your changes with GitHub's after many tries, so nothing was changed.");
	}
};
