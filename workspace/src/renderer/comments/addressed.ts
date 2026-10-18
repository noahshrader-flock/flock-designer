import type { ReviewComment } from '../../shared/contract';
import { workLabel } from '../../shared/work';

/**
 * What a card on a prototype says the agent did with its comment: where the change is, when that is another version
 * than the one the comment is on. The same words in the app and on the published page.
 */
export const prototypeAddressed = (comment: ReviewComment, current: string): string =>
	comment.addressedIn && comment.addressedIn !== current
		? `The agent addressed this in ${workLabel({ name: comment.addressedIn })}`
		: 'The agent addressed this';
