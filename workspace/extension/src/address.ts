import { type AddressPhase, type PrototypeAddressApi, runPrototypeAddress } from '../../src/renderer/address';
import { prototypeKey } from '../../src/shared/designPaths';
import type { CommentRef, WorkspaceApi } from '../../src/shared/contract';
import { valueOf } from '../../src/shared/result';
import { iterationLabel } from '../../src/shared/work';
import { type AgentWorkDeps, agentReady, agentWork } from './agentWork';
import { type Review, reviewsOf } from './messages';

export interface AddressDeps extends AgentWorkDeps {
	api: AgentWorkDeps['api'] & PrototypeAddressApi & Pick<WorkspaceApi, 'listProjects'>;
	/** Says how it went, in VS Code's notification, without waiting on anyone. */
	tell: (message: string) => void;
	openReview: (review: Review) => Promise<void>;
	/** How often the agent is asked how it is getting on. */
	pollMs?: number;
}

const labelOf = (projectId: string, name: string): string => iterationLabel({ name, branch: prototypeKey(projectId, name) });

/**
 * Address on one of a prototype's comments, from its review in VS Code (ELECTRON_MIGRATION_PLAN 4.2): the app's own
 * Address (`runPrototypeAddress`), said and stoppable as a build is, its log beside the editor. The change goes where
 * the core puts it: this iteration, or the next when others had commented on this one; the review then shows that page,
 * and says which. An agent that changed nothing says why in its log, and the review is left as it is.
 */
export const addressComment = async (deps: AddressDeps, review: Review, comment: CommentRef): Promise<null> => {
	const { api } = deps;
	await agentReady(api);
	let ended: AddressPhase | null = null;
	const { stopped } = await agentWork(
		deps,
		{ title: `Addressing a comment on ${review.title}`, logTitle: `${review.title}: addressing a comment` },
		async (say, isLive) => {
			say('The agent is working on the comment. This takes a few minutes.');
			await runPrototypeAddress({
				api,
				projectId: review.projectId,
				name: review.name,
				comment,
				isLive,
				onPhase: (phase) => {
					if (phase.kind === 'done' || phase.kind === 'failed') ended = phase;
				},
				...(deps.pollMs !== undefined ? { pollMs: deps.pollMs } : {}),
			});
		},
	);
	// Set as the run ended: read as what it is, not as it was before the run began.
	const outcome = ended as AddressPhase | null;
	if (stopped || outcome === null) return null;
	if (outcome.kind === 'failed') throw new Error(`The comment was not addressed: ${outcome.message}`);
	if (outcome.kind !== 'done' || !outcome.prototype) return null;
	if (!outcome.changed) {
		deps.tell(
			'The agent finished without changing anything. Its log says why: often the change is outside this iteration, or the comment needs a decision from you.',
		);
		return null;
	}
	const where = outcome.prototype.iteration;
	deps.tell(
		where === review.name
			? 'The agent has finished. Look at the page, then resolve what is done.'
			: `Others had commented on ${labelOf(review.projectId, review.name)}, so it stays as they saw it. The change is in ${labelOf(review.projectId, where)}.`,
	);
	const project = valueOf(await api.listProjects()).find((p) => p.id === review.projectId);
	await deps.openReview((project ? reviewsOf(project).find((r) => r.name === where) : undefined) ?? review);
	return null;
};
