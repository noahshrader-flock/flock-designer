import type { ReviewComment } from '../../shared/contract';
import { workLabel } from '../../shared/work';

export const prototypeAddressed = (comment: ReviewComment, current: string): string =>
	comment.addressedIn && comment.addressedIn !== current
		? `The agent addressed this in ${workLabel({ name: comment.addressedIn })}`
		: 'The agent addressed this';
