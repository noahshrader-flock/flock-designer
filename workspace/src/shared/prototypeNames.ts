import type { Person } from './contract';
import { isBot } from './people';

/**
 * A prototype's name is its **version**, `v3`: one idea for the project's brief, numbered in the order they were made and
 * never reused. A change to a version is made in it; a new version is made only when someone asks for one. This is the one
 * place a name is read, so everything that checks or counts one agrees.
 */
const PROTOTYPE_NAME = /^v([1-9]\d{0,3})$/;

/** A prototype's version number, or null when the name is not a prototype's. */
export const parseVersion = (name: string): number | null => {
	const m = PROTOTYPE_NAME.exec(name);
	return m ? Number(m[1]) : null;
};

export const isPrototypeName = (name: string): boolean => parseVersion(name) !== null;

export const prototypeName = (version: number): string => `v${version}`;

/**
 * Versions the newest first, by their number: a version is numbered one past the highest when it is made, so the highest
 * is the newest, whatever its record's date says. The one order every screen, the site and the records list them in.
 */
export const newestVersionFirst = (a: string, b: string): number => (parseVersion(b) ?? 0) - (parseVersion(a) ?? 0);

/** A new version: one past the highest, so no number is reused. */
export const nextVersionName = (names: string[]): string => prototypeName(names.reduce((max, n) => Math.max(max, parseVersion(n) ?? 0), 0) + 1);

/**
 * Whether anyone but a version's makers has commented on it. Once someone has, what they commented on is not changed under
 * them: the change is made in a new version from it. Makers are known by their GitHub login, as comment authors are; a
 * maker with none is not anyone's, so a version whose makers are unknown counts any comment as someone else's. A bot is
 * not someone who saw it.
 */
export const hasOutsideComments = (makers: Person[] | undefined, authors: string[]): boolean => {
	const own = new Set((makers ?? []).flatMap((p) => (p.login ? [p.login.toLowerCase()] : [])));
	return authors.some((a) => !isBot(a) && !own.has(a.toLowerCase()));
};
