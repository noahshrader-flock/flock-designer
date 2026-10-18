import { type AddressPhase, type PrototypeAddressApi, runPrototypeAddress } from '../../src/renderer/address';
import type { CommentRef, Project, WorkspaceApi } from '../../src/shared/contract';
import { prototypeKey } from '../../src/shared/designPaths';
import { plural } from '../../src/shared/plural';
import { commentsFromOthers, nextVersionName } from '../../src/shared/prototypeNames';
import { valueOf } from '../../src/shared/result';
import { workLabel } from '../../src/shared/work';
import { type AgentWorkDeps, type Offer, type Tell, agentReady, agentWork, pollOf } from './agentWork';
import { type Review, reviewsOf } from './messages';

export interface AddressDeps extends AgentWorkDeps {
	api: AgentWorkDeps['api'] & PrototypeAddressApi & Pick<WorkspaceApi, 'listProjects' | 'readComments'>;
	tell: Tell;
	/** Asks the person to choose, before a version others have commented on is changed. */
	offer: Offer;
	/** Shows the iteration the change is in, as whoever asked shows it: a review tab, or a page in the browser (and an open tab). */
	show: (review: Review) => Promise<void>;
}

/**
 * Address on one of a prototype's comments, from its review in VS Code (ELECTRON_MIGRATION_PLAN 4.2): the core's
 * Address (`runPrototypeAddress`), said and stoppable as a build is, its log beside the editor. The change is made in the
 * version commented on, or in a new version from it when asked for outright (`asked`). Otherwise, when others have commented on it (their pins may then land on the wrong element), or who has
 * cannot be read, the person is asked first: update it, or start a new version from it; nothing is done if they choose
 * neither. The page with the change is then shown (`show`), and which it is said, and returned, so a page in the browser can
 * go to it. An agent that changed nothing says why in its log, and the review is left as it is (null).
 */
/**
 * Whether the change is to go in a new version: false, in place, unless others have commented on the version (or who has
 * cannot be read) and the person chooses a new one. Null when they choose neither.
 */
const asksForNewVersion = async (deps: AddressDeps, project: Project | undefined, review: Review): Promise<boolean | null> => {
	const made = project?.work.find((w) => w.name === review.name);
	const read = await deps.api.readComments(review.projectId, prototypeKey(review.projectId, review.name));
	const others = read.ok
		? commentsFromOthers(
				made?.contributors,
				read.value.map((c) => c.author),
			)
		: null;
	if (others === 0) return false;
	const here = workLabel({ name: review.name });
	const update = `Update ${here}`;
	const fresh = `Start ${workLabel({ name: nextVersionName(project?.work.map((w) => w.name) ?? [review.name]) })} from it`;
	const said =
		others === null
			? `Who has commented on ${here} could not be read.`
			: `${plural(others, 'comment')} from others ${others === 1 ? 'is' : 'are'} on ${here}. Changing it in place can leave their pins on the wrong element.`;
	const chosen = await deps.offer(said, [update, fresh]);
	return chosen === undefined ? null : chosen === fresh;
};

export const addressComment = async (deps: AddressDeps, review: Review, comment: CommentRef, asked = false): Promise<string | null> => {
	const { api } = deps;
	await agentReady(api);
	const project = valueOf(await api.listProjects()).find((p) => p.id === review.projectId);
	// A new version asked for outright is made with no question; otherwise the person is asked only when others have commented.
	const newVersion = asked || (await asksForNewVersion(deps, project, review));
	if (newVersion === null) return null;
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
				newVersion,
				isLive,
				onPhase: (phase) => {
					if (phase.kind === 'done' || phase.kind === 'failed') ended = phase;
				},
				...pollOf(deps),
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
			'The agent finished without changing anything. Its log says why: often the change is outside this version, or the comment needs a decision from you.',
		);
		return null;
	}
	const where = outcome.prototype.iteration;
	deps.tell(
		where === review.name
			? 'The agent has finished. Look at the page, then resolve what is done.'
			: `The change is in ${workLabel({ name: where })}, a new version from ${workLabel({ name: review.name })}, which stays as it was.`,
	);
	const now = valueOf(await api.listProjects()).find((p) => p.id === review.projectId);
	await deps.show((now ? reviewsOf(now).find((r) => r.name === where) : undefined) ?? review);
	return where;
};
