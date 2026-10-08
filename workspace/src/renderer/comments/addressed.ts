import type { ReviewComment } from '../../shared/contract';
import { iterationLabel, prototypeKey } from '../../shared/projects';

/**
 * What a card on a prototype says the agent did with its comment: where the change is, when that is another iteration
 * than the one the comment is on. The same words in the app and on the published page.
 */
export const prototypeAddressed = (comment: ReviewComment, projectId: string, current: string): string =>
	comment.addressedIn && comment.addressedIn !== current
		? `The agent addressed this in ${iterationLabel({ name: comment.addressedIn, branch: prototypeKey(projectId, comment.addressedIn) })}`
		: 'The agent addressed this';
