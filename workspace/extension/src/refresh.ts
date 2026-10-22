import type { WorkspaceApi } from '../../src/shared/contract';
import { handedTo } from '../../src/shared/handedTo';
import { valueOf } from '../../src/shared/result';
import { workLabel } from '../../src/shared/work';
import type { Tell } from './say';
import type { Review } from './messages';

export interface RefreshDeps {
	api: Pick<WorkspaceApi, 'handPrototypeRefresh'>;
	tell: Tell;
	/** Saves the rebuild once the agent has built it, as a handed build is saved. */
	watch: (prototypeId: string, name: string, title: string, from: string | null) => void;
}

/** Refresh to latest: the version is rebuilt on the latest of its branch, in place, by the agent. */
export const refreshPrototype = async (deps: RefreshDeps, root: string, review: Review): Promise<void> => {
	const handed = valueOf(await deps.api.handPrototypeRefresh(root, review.prototypeId, review.name));
	deps.watch(review.prototypeId, review.name, review.title, null);
	deps.tell(
		`${handedTo(handed, `Rebuilding ${review.title} ${workLabel({ name: review.name })} on the latest code`)} DSNR saves the page when it is built; its comments stay, pinned where they were made.`,
	);
};
