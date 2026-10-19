import type { CommentRef, ReviewComment } from '../../../shared/contract';
import { numberComments, openComments } from '../../../shared/comments';

/** Relative to the design repository. */
export const ADDRESS_SKILL = 'skills/address-comments.md';

/** `comments` must be a read made just now: that is what catches a comment resolved or deleted a moment ago. */
export const chooseComment = (comments: ReviewComment[], comment: CommentRef): number => {
	if (openComments(comments).length === 0) throw new Error('There are no open comments to address.');
	const chosen = comments.find((c) => c.thread === comment.thread && c.id === comment.id);
	if (!chosen) throw new Error('That comment is no longer there. It may have been deleted since this screen was last read.');
	if (chosen.resolved) throw new Error('That comment has been resolved already, so there is nothing to act on.');
	const number = numberComments(comments).get(chosen.id);
	if (number === undefined) throw new Error('That comment could not be numbered, so the agent cannot be told which one to act on.');
	return number;
};
