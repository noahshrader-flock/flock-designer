import type { CommentRef, Person, ReviewComment } from './contract';
import { plural } from './plural';
import { isBot } from './people';

/** A prototype's name is its version, `v3`, numbered in the order made and never reused. */
const PROTOTYPE_NAME = /^v([1-9]\d{0,3})$/;

export const parseVersion = (name: string): number | null => {
	const m = PROTOTYPE_NAME.exec(name);
	return m ? Number(m[1]) : null;
};

export const isPrototypeName = (name: string): boolean => parseVersion(name) !== null;

export const prototypeName = (version: number): string => `v${version}`;

/** By number: the highest is the newest, whatever its record's date says. */
export const newestVersionFirst = (a: string, b: string): number => (parseVersion(b) ?? 0) - (parseVersion(a) ?? 0);

export const nextVersionName = (names: string[]): string => prototypeName(names.reduce((max, n) => Math.max(max, parseVersion(n) ?? 0), 0) + 1);

/**
 * A change in place can leave others' pins on the wrong element, so the person is told first. Makers are matched by login,
 * so a version whose makers are unknown counts every comment; `acting` and bots are left out.
 */
export const commentsFromOthers = (
	makers: Person[] | undefined,
	comments: Pick<ReviewComment, 'author' | 'resolved' | 'thread' | 'id'>[],
	acting?: CommentRef,
): number => {
	const own = new Set((makers ?? []).flatMap((p) => (p.login ? [p.login.toLowerCase()] : [])));
	return comments.filter(
		(c) => !c.resolved && !(acting && c.thread === acting.thread && c.id === acting.id) && !isBot(c.author) && !own.has(c.author.toLowerCase()),
	).length;
};

export const othersHaveCommented = (others: number, label: string): string =>
	`${plural(others, 'comment')} from others ${others === 1 ? 'is' : 'are'} on ${label}.`;
