import { arg, handle } from '../handle';
import type { ReviewArea } from '../areas/review';

/**
 * The project list, its records, and the review comments kept as GitHub issues.
 */
export const registerReview = (area: ReviewArea): void => {
	handle('listProjects', [], area.listProjects);
	handle('readComments', [arg.projectId, arg.branch], area.readComments);
	handle('postComment', [arg.projectId, arg.branch, arg.words, arg.unknown, arg.unknown], area.postComment);
	handle('moveComment', [arg.comment, arg.unknown], area.moveComment);
	handle('deleteComment', [arg.comment], area.deleteComment);
	handle('resolveComment', [arg.comment, arg.flag], area.resolveComment);
};
