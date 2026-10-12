import type { Person } from './contract';
import { isBot } from './people';

/** A prototype's name, `v2-i3`: its version and iteration, the next of each, and how it is labelled. */

/**
 * A prototype's name says which **version** it belongs to (a different idea for the same brief) and which
 * **iteration** of that version it is (a refinement): `v2-i3`. Names from before versions, `i1`, `i2`, are version 1,
 * and keep the key, files and review thread they have always had: nothing is renamed. This is the one place a name is
 * read, so everything that checks or counts one agrees.
 */
const PROTOTYPE_NAME = /^(?:v([1-9]\d{0,2})-)?i([1-9]\d{0,3})$/;

export interface PrototypeName {
	version: number;
	iteration: number;
	/** Written before versions existed (`i1`): read as version 1. */
	legacy: boolean;
}

export const parsePrototypeName = (name: string): PrototypeName | null => {
	const m = PROTOTYPE_NAME.exec(name);
	return m ? { version: Number(m[1] ?? 1), iteration: Number(m[2]), legacy: m[1] === undefined } : null;
};

export const isPrototypeName = (name: string): boolean => parsePrototypeName(name) !== null;

/** A name in the new form. Only reading accepts the old one. */
export const prototypeName = (version: number, iteration: number): string => `v${version}-i${iteration}`;

const parsedNames = (names: string[]): PrototypeName[] => names.map(parsePrototypeName).filter((p): p is PrototypeName => p !== null);

/** A new idea for the project: the first iteration of the next version, one past the highest, so no number is reused. */
export const nextPrototypeName = (names: string[]): string =>
	prototypeName(parsedNames(names).reduce((max, p) => Math.max(max, p.version), 0) + 1, 1);

/** A refinement of a version: its next iteration, one past the highest it has had. */
export const nextIterationName = (names: string[], version: number): string =>
	prototypeName(
		version,
		parsedNames(names)
			.filter((p) => p.version === version)
			.reduce((max, p) => Math.max(max, p.iteration), 0) + 1,
	);

/** A version's newest iteration, by the name it was recorded under, or null when the version has none. */
export const latestIterationName = (names: string[], version: number): string | null => {
	let best: { name: string; iteration: number } | null = null;
	for (const name of names) {
		const p = parsePrototypeName(name);
		if (p && p.version === version && (best === null || p.iteration > best.iteration)) best = { name, iteration: p.iteration };
	}
	return best?.name ?? null;
};

/**
 * Whether anyone but an iteration's makers has commented on it. Once someone has, the iteration is **frozen**: what
 * they commented on is never changed under them, and the next change is made in the next iteration. Makers are known
 * by their GitHub login, as comment authors are; a maker with none is not anyone's, so an iteration whose makers are
 * unknown is frozen by any comment rather than changed under it. A bot is not someone who saw it.
 */
export const hasOutsideComments = (makers: Person[] | undefined, authors: string[]): boolean => {
	const own = new Set((makers ?? []).flatMap((p) => (p.login ? [p.login.toLowerCase()] : [])));
	return authors.some((a) => !isBot(a) && !own.has(a.toLowerCase()));
};

/**
 * A project's prototypes, version by version, for the switcher and the project page. Versions appear in the order of
 * their first iteration in the list given (so a newest-first list puts the newest idea first), iterations in the order
 * given within each.
 */
export const byVersion = <T extends { name: string }>(iterations: T[]): { version: number; iterations: T[] }[] => {
	const groups = new Map<number, T[]>();
	for (const it of iterations) {
		const p = parsePrototypeName(it.name);
		if (!p) continue;
		groups.set(p.version, [...(groups.get(p.version) ?? []), it]);
	}
	return [...groups].map(([version, its]) => ({ version, iterations: its }));
};
