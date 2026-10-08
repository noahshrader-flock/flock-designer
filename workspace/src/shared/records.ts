import type { Iteration } from './contract';
import { asPeople, mergePeople } from './people';

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
 * A project's `iterations.json`, read: a list of records, each with a name, or null when it is anything else. The one
 * place the file is judged, so everything that reads it agrees on what a readable one is.
 */
export const parseIterations = (text: string): Iteration[] | null => parse(text) as Iteration[] | null;

const parse = (text: string): Rec[] | null => {
	try {
		const value: unknown = JSON.parse(text);
		return Array.isArray(value) && value.every((r) => typeof r === 'object' && r !== null && typeof (r as Rec).name === 'string')
			? (value as Rec[])
			: null;
	} catch {
		return null;
	}
};

const earliest = (a: unknown, b: unknown): unknown => {
	const da = typeof a === 'string' ? Date.parse(a) : Number.NaN;
	const db = typeof b === 'string' ? Date.parse(b) : Number.NaN;
	if (Number.isNaN(da)) return Number.isNaN(db) ? (a ?? b) : b;
	if (Number.isNaN(db)) return a;
	return da <= db ? a : b;
};

/** `mine` is this machine's copy and wins where the two disagree about a value; `theirs` fills what mine lacks. */
export const mergeIterationRecords = (mine: string, theirs: string): string | null => {
	const a = parse(mine);
	const b = parse(theirs);
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
	return `${JSON.stringify(list, null, 2)}\n`;
};
