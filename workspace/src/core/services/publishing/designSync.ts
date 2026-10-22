import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PublishProblem } from '../../../shared/contract';
import { plural } from '../../../shared/plural';
import { mergeWorkRecords } from '../../../shared/workRecords';
import { commitOnto, git } from '../platform/git';
import { errorText } from '../../../shared/result';
import { HOST } from '../../../shared/vocabulary';
import { PROTOTYPES_DIR, prototypeIdOf, workPath } from '../../../shared/designPaths';

/**
 * The commit is built on GitHub's tip in a temporary index and pushed plainly, so the person's branch, index and files
 * are never rebased or stashed. Runs at once need no lock: a refused push builds again on what GitHub has.
 */

export type Problem = PublishProblem;

export interface SyncResult {
	/** Prototype ids. */
	published: string[];
	problems: Problem[];
}

const RECORDS = 'Prototype records';
const isRecordFile = (f: string): boolean => f === workPath(f.split('/')[1] ?? '');
const lines = (out: string): string[] => out.split('\n').filter(Boolean);
const message = (err: unknown): string => errorText(err, { firstLine: true });

/**
 * `started`: whether a prototype has a version started on this machine and not saved yet. Such a prototype with no records
 * here is held back whole (its brief, what the agent writes), so nothing of it is shared until its first page is.
 */
export const syncRecords = async (designRoot: string, started: (prototypeId: string) => boolean): Promise<SyncResult> => {
	const g = (...args: string[]) => git(designRoot, args, { timeoutMs: 120_000 });
	const held = (why: string, files?: string[]): SyncResult => ({ published: [], problems: [{ what: RECORDS, why, files }] });

	// Without a branch that tracks the same-named branch on GitHub there is nowhere safe to put records.
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
		const outside = lines(await g('diff', '--name-only', `${theirs}...HEAD`)).filter((f) => !f.startsWith(`${PROTOTYPES_DIR}/`));
		if (outside.length > 0) {
			return held(
				`${plural(outside.length, 'change')} outside the prototype records ${outside.length === 1 ? 'is' : 'are'} waiting to be pushed. Records are held back; push ${outside.length === 1 ? 'it' : 'those'} yourself, and records will flow again.`,
				outside,
			);
		}

		const made = await recordsOnTopOf(designRoot, theirs, started);
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
 * A `work.json` changed on both sides is ordinary and merged by meaning; any other file changed on both is for people to
 * settle. A string says what to tell the person.
 */
const recordsOnTopOf = async (
	designRoot: string,
	theirs: string,
	started: (prototypeId: string) => boolean,
): Promise<string | { commit: string | null; ids: string[]; paths: string[]; read: Map<string, string | null> }> => {
	const g = (args: string[], input?: string) => git(designRoot, args, { input });
	const blobAt = (rev: string, path: string) => g(['rev-parse', '-q', '--verify', `${rev}:${path}`]).catch(() => null);
	const base = await g(['merge-base', 'HEAD', theirs]).catch(() => null);
	if (base === null) return `The design repository here and on ${HOST} share no history, so records are not published into it.`;

	const held = new Map<string, boolean>();
	const unrecorded = (path: string): boolean => {
		const id = path.split('/')[1] ?? '';
		if (!held.has(id)) held.set(id, started(id) && !existsSync(join(designRoot, workPath(id))));
		return held.get(id) === true;
	};
	const paths = [
		...new Set([
			...lines(await g(['diff', '--name-only', '--no-renames', base, '--', PROTOTYPES_DIR])),
			...lines(await g(['ls-files', '--others', '--exclude-standard', '--', PROTOTYPES_DIR])),
		]),
	]
		.filter((p) => !unrecorded(p))
		.sort();
	// Null when the file is deleted.
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

	// A record that does not parse must never be published: every reviewer's prototype list reads these.
	for (const [path, blob] of changes) {
		if (!isRecordFile(path) || blob === null) continue;
		const text = await git(designRoot, ['cat-file', 'blob', blob], { trim: false });
		if (mergeWorkRecords(text, text) === null) {
			return `${path} is not a valid record, so nothing was published. Fix it in the design repository, and records will flow again.`;
		}
	}

	const ids = [...new Set([...changes.keys()].map(prototypeIdOf).filter((x): x is string => Boolean(x)))].sort();
	try {
		const commit = await commitOnto(designRoot, theirs, theirs, changes, `Update ${ids.join(', ')}`);
		return commit === null ? { commit: null, ids: [], paths, read } : { commit, ids, paths, read };
	} catch (err) {
		return `Could not save the prototype records: ${message(err)}. Git needs a name and email (git config user.name, user.email).`;
	}
};

/**
 * A merged record is written here first only if unchanged since `read` (a newer one waits for the next run), then staged
 * so git can move over it; git itself refuses when anything else of the person's would be overwritten.
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
