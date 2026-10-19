import type { CommentRef, Project, PrototypeAddressed, Result, JobEnd, WorkspaceApi } from '../../src/shared/contract';
import { prototypeKey } from '../../src/shared/designPaths';
import { commentsFromOthers, nextVersionName, othersHaveCommented } from '../../src/shared/prototypeNames';
import { valueOf } from '../../src/shared/result';
import { workLabel } from '../../src/shared/work';
import { type AgentWorkDeps, type Offer, type Tell, agentReady, agentWork } from './agentWork';
import { type Review, reviewsOf } from './messages';

export interface AddressDeps extends AgentWorkDeps {
	api: AgentWorkDeps['api'] & Pick<WorkspaceApi, 'addressPrototype' | 'listProjects' | 'readComments'>;
	tell: Tell;
	offer: Offer;
	show: (review: Review) => Promise<void>;
}

/**
 * False (in place) unless others have open comments besides the one acted on, or who has cannot be read, and the person
 * chooses a new version. Null when they choose neither.
 */
const asksForNewVersion = async (deps: AddressDeps, project: Project | undefined, review: Review, comment: CommentRef): Promise<boolean | null> => {
	const made = project?.work.find((w) => w.name === review.name);
	const read = await deps.api.readComments(review.projectId, prototypeKey(review.projectId, review.name));
	const others = read.ok ? commentsFromOthers(made?.contributors, read.value, comment) : null;
	if (others === 0) return false;
	const here = workLabel({ name: review.name });
	const next = project ? workLabel({ name: nextVersionName(project.work.map((w) => w.name)) }) : 'a new version';
	const fresh = `Start ${next} from it`;
	const said =
		others === null
			? `Who has commented on ${here} could not be read.`
			: `${othersHaveCommented(others, here)} Changing it in place can leave their pins on the wrong element.`;
	const chosen = await deps.offer(said, [`Update ${here}`, fresh]);
	return chosen === undefined ? null : chosen === fresh;
};

/** Returns the version with the change, so a page in the browser can go to it, or null when nothing was changed. */
export const addressComment = async (deps: AddressDeps, review: Review, comment: CommentRef, newVersion = false): Promise<string | null> => {
	const { api } = deps;
	await agentReady(api);
	const project = valueOf(await api.listProjects()).find((p) => p.id === review.projectId);
	const inNew = newVersion || (await asksForNewVersion(deps, project, review, comment));
	if (inNew === null) return null;
	let ended: Result<JobEnd<PrototypeAddressed>> | null = null;
	const { stopped } = await agentWork(
		deps,
		{ title: `Addressing a comment on ${review.title}`, logTitle: `${review.title}: addressing a comment` },
		async (say) => {
			say('The agent is working on the comment. This takes a few minutes.');
			ended = await api.addressPrototype(review.projectId, review.name, comment, inNew);
		},
	);
	// Set inside the callback, so TypeScript's narrowing to null from before the run does not hold.
	const outcome = ended as Result<JobEnd<PrototypeAddressed>> | null;
	if (stopped || outcome === null) return null;
	if (!outcome.ok) throw new Error(`The comment was not addressed: ${outcome.error}`);
	if (outcome.value.state === 'stopped') return null;
	const addressed = outcome.value.value;
	if (!addressed.changed) {
		deps.tell(
			'The agent finished without changing anything. Its log says why: often the change is outside this version, or the comment needs a decision from you.',
		);
		return null;
	}
	const where = addressed.version;
	deps.tell(
		where === review.name
			? 'The agent has finished. Look at the page, then resolve what is done.'
			: `The change is in ${workLabel({ name: where })}, a new version from ${workLabel({ name: review.name })}, which stays as it was.`,
	);
	const now = valueOf(await api.listProjects()).find((p) => p.id === review.projectId);
	await deps.show((now ? reviewsOf(now).find((r) => r.name === where) : undefined) ?? review);
	return where;
};
