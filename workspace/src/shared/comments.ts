import type { CommentAnchor, CommentRef, MarkerRequest, ReviewComment } from './contract';

/**
 * What is read back from GitHub, plus what this window just posted. GitHub's listings can trail a new comment, so one
 * posted here is shown until the read includes it; for a comment GitHub returned, its copy always wins, so a newer read
 * (someone resolved or edited it) is not undone by an older local copy.
 */
export const mergeComments = (fetched: ReviewComment[], posted: Iterable<ReviewComment>): ReviewComment[] => {
	const have = new Set(fetched.map((c) => c.id));
	return [...fetched, ...[...posted].filter((c) => !have.has(c.id))].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
};

/**
 * Forgets the local copies of comments GitHub has now returned: they have served their purpose, and
 * keeping one means a later change to it there -- someone resolving it, editing it -- would be held
 * back by a copy of how it looked when it was written.
 */
export const forgetPosted = (posted: Map<number, ReviewComment>, fetched: ReviewComment[]): void => {
	for (const c of fetched) posted.delete(c.id);
};

/**
 * Still to be dealt with, and already dealt with. One definition, because it decides the count on screen, whether a
 * comment has a pin, what the agent's file lists as outstanding and whether the agent may start: those must never
 * disagree about what "open" means.
 */
export const openComments = (comments: ReviewComment[]): ReviewComment[] => comments.filter((c) => !c.resolved);
export const resolvedComments = (comments: ReviewComment[]): ReviewComment[] => comments.filter((c) => c.resolved);

/**
 * A comment's reference alone, as the window sends it to act on one: not the comment it was read with, whose picture
 * can be a large data URL that has no business crossing to the core again.
 */
export const commentRef = ({ thread, id }: CommentRef): CommentRef => ({ thread, id });

/**
 * What number each comment carries for the agent (no number is shown on screen): Address names "comment 3", and the
 * agent reads "Comment 3" in a file written elsewhere, so both ends use this one count. Comments that point at the page
 * come first, in the order made, then page-level ones; a comment keeps its number when others are resolved.
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

/**
 * The pins to draw: one per open comment that points at the page, plus the one being placed. **The draft pin exists
 * only while its comment is being written:** a pin with no box to type in can be neither finished nor dismissed, and
 * drawing both from this one condition keeps them from disagreeing.
 */
export const markersFor = (
	comments: ReviewComment[],
	me: string | null,
	draft: { anchor: CommentAnchor; composing: boolean } | null,
): MarkerRequest[] => {
	const anchored = comments.filter((c) => c.anchor);
	const items = openComments(anchored).map((c): MarkerRequest => ({
		id: c.id,
		author: c.author,
		avatarUrl: c.authorAvatarUrl,
		anchor: c.anchor as CommentAnchor,
		movable: c.author === me,
	}));
	// Nobody's yet: a plain pin, until the comment is written.
	if (draft?.composing) items.push({ id: -1, author: '', avatarUrl: null, anchor: draft.anchor, movable: true });
	return items;
};
