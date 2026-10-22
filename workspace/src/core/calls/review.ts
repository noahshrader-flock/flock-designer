import { arg, handle } from '../handle';
import type { ReviewArea } from '../areas/review';

export const registerReview = (area: ReviewArea): void => {
	handle('listPrototypes', [], area.listPrototypes);
	handle('readComments', [arg.prototypeId, arg.branch], area.readComments);
	handle('postComment', [arg.prototypeId, arg.branch, arg.words, arg.unknown, arg.unknown], area.postComment);
	handle('moveComment', [arg.comment, arg.unknown], area.moveComment);
	handle('deleteComment', [arg.comment], area.deleteComment);
	handle('resolveComment', [arg.comment, arg.flag], area.resolveComment);
};
