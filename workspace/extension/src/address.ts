import type { CommentRef, Prototype, WorkspaceApi } from '../../src/shared/contract';
import { prototypeKey } from '../../src/shared/designPaths';
import { handedTo } from '../../src/shared/handedTo';
import { commentsFromOthers, nextVersionName, othersHaveCommented } from '../../src/shared/versionNames';
import { valueOf } from '../../src/shared/result';
import { workLabel } from '../../src/shared/work';
import type { Offer, Tell } from './say';
import type { Review } from './messages';

export interface AddressDeps {
	api: Pick<WorkspaceApi, 'handPrototypeAddress' | 'listPrototypes' | 'readComments'>;
	tell: Tell;
	offer: Offer;
	/** Saves the change once the agent has built it, as a handed build is saved. */
	watch: (prototypeId: string, name: string, title: string, from: string | null) => void;
}

/**
 * False (in place) unless others have open comments besides the one acted on, or who has cannot be read, and the person
 * chooses a new version. Null when they choose neither.
 */
const asksForNewVersion = async (
	deps: AddressDeps,
	prototype: Prototype | undefined,
	review: Review,
	comment: CommentRef,
): Promise<boolean | null> => {
	const made = prototype?.work.find((w) => w.name === review.name);
	const read = await deps.api.readComments(review.prototypeId, prototypeKey(review.prototypeId, review.name));
	const others = read.ok ? commentsFromOthers(made?.contributors, read.value, comment) : null;
	if (others === 0) return false;
	const here = workLabel({ name: review.name });
	const next = prototype ? workLabel({ name: nextVersionName(prototype.work.map((w) => w.name)) }) : 'a new version';
	const fresh = `Start ${next} from it`;
	const said =
		others === null
			? `Who has commented on ${here} could not be read.`
			: `${othersHaveCommented(others, here)} Changing it in place can leave their pins on the wrong element.`;
	const chosen = await deps.offer(said, [`Update ${here}`, fresh]);
	return chosen === undefined ? null : chosen === fresh;
};

export const addressComment = async (deps: AddressDeps, root: string, review: Review, comment: CommentRef, newVersion = false): Promise<void> => {
	const { api } = deps;
	const prototype = valueOf(await api.listPrototypes()).find((p) => p.id === review.prototypeId);
	const inNew = newVersion || (await asksForNewVersion(deps, prototype, review, comment));
	if (inNew === null) return;
	const handed = valueOf(await api.handPrototypeAddress(root, review.prototypeId, review.name, comment, inNew));
	deps.watch(review.prototypeId, handed.target, review.title, handed.from);
	const where =
		handed.from === null
			? ''
			: ` The change is made in ${workLabel({ name: handed.target })}, a new version from ${workLabel({ name: handed.from })}, which stays as it was.`;
	deps.tell(
		`${handedTo(handed, `Comment ${handed.number} on ${review.title}`)}${where} DSNR saves the page when it is built. Resolve the comment once you have looked at it.`,
	);
};
