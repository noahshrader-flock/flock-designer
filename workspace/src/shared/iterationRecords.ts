import type { Iteration, ProjectIteration } from './contract';
import { asRecord } from './json';
import { asPeople, mergePeople } from './people';
import { asCover, asDate, asRoute } from './validate';
import { asRepositoryPath } from './repoRef';
import { asChangeRequestUrl } from './hostUrls';
import { isCommit } from './sha';

/**
 * Two copies of one project's `iterations.json`, made on different machines, as one.
 *
 * Git can merge text but not meaning: two people recording different iterations of the same project
 * both rewrite the same short file, and a line-based merge calls that a conflict. This is the merge
 * that understands it. The records are a list keyed by iteration name; where both copies have an
 * iteration, the fields are combined and nothing either side knew is lost.
 *
 * Returns null if either side is not a list of records, so the caller can say so rather than
 * write something guessed.
 */

type Rec = Record<string, unknown>;

/**
 * A project's `iterations.json` as written: a list of records, each with a name and a branch, or null when it is anything
 * else. The one place the file is judged, so everything that reads it agrees on what a readable one is.
 */
const rawRecords = (text: string): Rec[] | null => {
	try {
		const value: unknown = JSON.parse(text);
		return Array.isArray(value) && value.every((r) => typeof asRecord(r).name === 'string' && typeof asRecord(r).branch === 'string')
			? (value as Rec[])
			: null;
	} catch {
		return null;
	}
};

const basedOnOf = (v: unknown): Iteration['basedOn'] | undefined => {
	const b = asRecord(v);
	if (!(typeof b.repository === 'string' && typeof b.branch === 'string' && (typeof b.commit === 'string' || b.commit === null))) return undefined;
	// The product, only as a repository's path: a record never names anything else as one.
	const product = asRepositoryPath(b.product);
	return { repository: b.repository, branch: b.branch, commit: b.commit, ...(product ? { product } : {}) };
};

/**
 * One record, checked: each field the app knows is what it should be, or left out (an address a page will be sent to, a
 * picture's name, a link), never trusted because a file said so. What it does not know is kept, so a list read and
 * written back never loses what a newer version wrote.
 */
const KNOWN = [
	'projectId',
	'name',
	'branch',
	'commit',
	'createdAt',
	'note',
	'contributors',
	'previewUrl',
	'pullRequest',
	'repository',
	'route',
	'basedOn',
	'cover',
	'readyAt',
];

const checked = (r: Rec): Iteration => {
	const rest = Object.fromEntries(Object.entries(r).filter(([k]) => !KNOWN.includes(k)));
	const pullRequest = asChangeRequestUrl(r.pullRequest);
	const repository = asRepositoryPath(r.repository);
	const route = asRoute(r.route);
	const basedOn = basedOnOf(r.basedOn);
	const cover = asCover(r.cover);
	return {
		...rest,
		projectId: typeof r.projectId === 'string' ? r.projectId : '',
		name: r.name as string,
		branch: r.branch as string,
		commit: typeof r.commit === 'string' ? r.commit : null,
		createdAt: typeof r.createdAt === 'string' ? r.createdAt : '',
		note: typeof r.note === 'string' ? r.note : '',
		...(Array.isArray(r.contributors) ? { contributors: asPeople(r.contributors) } : {}),
		...(typeof r.previewUrl === 'string' ? { previewUrl: r.previewUrl } : {}),
		...(pullRequest !== null ? { pullRequest } : {}),
		...(repository !== null ? { repository } : {}),
		...(route !== null ? { route } : {}),
		...(basedOn ? { basedOn } : {}),
		...(cover !== null ? { cover } : {}),
		...(isCommit(r.readyAt) ? { readyAt: r.readyAt } : {}),
	};
};

export const parseIterations = (text: string): Iteration[] | null => rawRecords(text)?.map(checked) ?? null;

/** The file as written, the one way: two-space JSON, ending in a newline. */
export const serializeIterations = (records: readonly unknown[]): string => `${JSON.stringify(records, null, 2)}\n`;

/** A record as the window shows it, with its review thread when it has one. */
export const toProjectIteration = (r: Iteration, thread?: { number: number; openComments: number }): ProjectIteration => ({
	name: r.name,
	branch: r.branch,
	issueNumber: thread?.number ?? null,
	openComments: thread?.openComments ?? 0,
	previewUrl: r.previewUrl ?? null,
	repository: r.repository ?? null,
	pullRequest: r.pullRequest ?? null,
	commit: r.commit,
	contributors: r.contributors ?? [],
	createdAt: asDate(r.createdAt),
	route: r.route ?? null,
	cover: r.cover ?? null,
	product: r.basedOn?.product ?? null,
	// As the record says; `listProjects` keeps it only once it is known to be the branch's commit still.
	readyAt: r.readyAt ?? null,
});

const earliest = (a: unknown, b: unknown): unknown => {
	const da = typeof a === 'string' ? Date.parse(a) : Number.NaN;
	const db = typeof b === 'string' ? Date.parse(b) : Number.NaN;
	if (Number.isNaN(da)) return Number.isNaN(db) ? (a ?? b) : b;
	if (Number.isNaN(db)) return a;
	return da <= db ? a : b;
};

/** `mine` is this machine's copy and wins where the two disagree about a value; `theirs` fills what mine lacks. */
export const mergeIterationRecords = (mine: string, theirs: string): string | null => {
	const a = rawRecords(mine);
	const b = rawRecords(theirs);
	if (a === null || b === null) return null;

	const byName = new Map<string, Rec>();
	for (const r of b) byName.set(String(r.name), r);
	for (const r of a) {
		const other = byName.get(String(r.name));
		if (!other) {
			byName.set(String(r.name), r);
			continue;
		}
		const people = mergePeople(asPeople(other.contributors), asPeople(r.contributors));
		const merged: Rec = { ...other, ...r };
		// A value mine does not have must not blank the one theirs does.
		for (const key of Object.keys(other)) if (r[key] === null || r[key] === undefined) merged[key] = other[key];
		if (other.createdAt !== undefined || r.createdAt !== undefined) merged.createdAt = earliest(r.createdAt, other.createdAt);
		if (people.length > 0) merged.contributors = people;
		byName.set(String(r.name), merged);
	}
	const list = [...byName.values()].sort((x, y) => String(x.name).localeCompare(String(y.name), undefined, { numeric: true }));
	return serializeIterations(list);
};
