import { arg, handle } from '../handle';
import type { ReviewArea } from '../areas/review';

/**
 * The project list, its records, and the review comments kept as GitHub issues.
 */
export const registerReview = (area: ReviewArea): void => {
	// Reviewer mode: read through the API, never a checkout.
	// Everything on GitHub plus everything built on this machine. Work made here
	// must appear here, shared or not, so the two are merged; if GitHub cannot be
	// reached, what is local still shows.
	handle('listProjects', [], area.listProjects);
	handle('readComments', [arg.projectId, arg.branch], area.readComments);
	handle('postComment', [arg.projectId, arg.branch, arg.words, arg.unknown, arg.unknown], area.postComment);
	handle('moveComment', [arg.comment, arg.unknown], area.moveComment);
	handle('deleteComment', [arg.comment], area.deleteComment);
	handle('resolveComment', [arg.comment, arg.flag], area.resolveComment);
};
