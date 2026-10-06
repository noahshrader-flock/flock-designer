import type { ReviewComment } from './contract';

/**
 * What is read back from GitHub, plus what was just posted from this window.
 *
 * GitHub's listings can trail a new comment, so a comment this window posted is kept and shown
 * until the read includes it. What GitHub returned always wins for a comment it returned: a
 * newer read (someone resolved it, or edited it) is not undone by an older local copy.
 */
export const mergeComments = (fetched: ReviewComment[], posted: Iterable<ReviewComment>): ReviewComment[] => {
	const have = new Set(fetched.map((c) => c.id));
	return [...fetched, ...[...posted].filter((c) => !have.has(c.id))].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
};

/**
 * What number each comment carries: the digit drawn in its pin, and the heading it is filed under
 * in the file an agent reads.
 *
 * One definition, used by both ends. A reviewer says "comment 3" having read it off a pin, and the
 * agent reads "Comment 3" out of a file written somewhere else entirely; if the two ever counted
 * differently, that sentence would quietly point at the wrong thing. Comments that point at the
 * page are numbered first, in the order they were made, so a pin's number is its place among the
 * pins; page-level ones follow. A comment keeps its number when others are resolved.
 */
export const numberComments = (comments: ReviewComment[]): Map<number, number> => {
	const ordered = [...comments].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
	return new Map([...ordered.filter((c) => c.anchor), ...ordered.filter((c) => !c.anchor)].map((c, i) => [c.id, i + 1]));
};

/** Whether two lists would look the same on screen, so a refresh that found nothing new changes nothing. */
export const sameComments = (a: ReviewComment[] | null, b: ReviewComment[]): boolean =>
	a !== null &&
	a.length === b.length &&
	a.every((c, i) => {
		const o = b[i] as ReviewComment;
		return (
			c.id === o.id &&
			c.resolved === o.resolved &&
			c.body === o.body &&
			c.picture === o.picture &&
			JSON.stringify(c.anchor) === JSON.stringify(o.anchor)
		);
	});
