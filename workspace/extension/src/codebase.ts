import { type BuildApi, type BuildPhase, runLocalBuild } from '../../src/renderer/localBuild';
import type { Project, ProjectIteration, ShareStatus, ShareStep, WorkspaceApi } from '../../src/shared/contract';
import { valueOf } from '../../src/shared/result';
import { codeLink, workOf } from '../../src/shared/work';
import { type AgentWorkDeps, type Offer, type Tell, agentReady, agentWork, pollOf } from './agentWork';

export interface CodebaseDeps extends AgentWorkDeps {
	api: AgentWorkDeps['api'] & BuildApi & Pick<WorkspaceApi, 'listProjects' | 'handoffResult' | 'shareIteration' | 'onShareStatus'>;
	/** The product folder that is open: where the codebase work is. */
	root: string;
	tell: Tell;
	offer: Offer;
	openExternal: (url: string) => Promise<void>;
	copy: (text: string) => Promise<void>;
}

/** A project's codebase work, read as the list has it: the project, and the iteration that is its work in the code. */
const codebaseOf = async (api: CodebaseDeps['api'], projectId: string): Promise<{ project: Project; iteration: ProjectIteration }> => {
	const project = valueOf(await api.listProjects()).find((p) => p.id === projectId);
	if (!project) throw new Error(`There is no project ${projectId} here.`);
	const iteration = workOf(project.iterations, 'codebase')[0];
	if (!iteration) throw new Error(`${project.title} has no codebase work yet: build it in the codebase first.`);
	return { project, iteration };
};

const OPEN_PR = 'Open a draft pull request';

/**
 * Handoff, from VS Code (ELECTRON_MIGRATION_PLAN 5.2): the app's own run (`runLocalBuild` with `handoff`) on the project's
 * codebase work, on its branch: the product's gate, both reviews, the fixes, HANDOFF.md committed, nothing pushed. Said
 * and stoppable as a build is, its log beside the editor; then the verdict, and when it is ready, a draft pull request.
 */
export const handOff = async (deps: CodebaseDeps, projectId: string): Promise<void> => {
	const { api, root } = deps;
	await agentReady(api);
	const { project, iteration } = await codebaseOf(api, projectId);
	let failed: string | null = null;
	let reported = false;
	const { stopped } = await agentWork(deps, { title: `Handing off ${project.title}`, logTitle: `${project.title}: handoff` }, async (say, isLive) => {
		say('Running the product’s gate, both reviews and the fixes. This takes a while.');
		await runLocalBuild({
			api,
			root,
			project,
			iteration,
			handoff: true,
			isLive,
			onPhase: (phase: BuildPhase) => {
				if (phase.kind === 'failed') failed = phase.message;
				if (phase.kind === 'reported') reported = true;
			},
			...pollOf(deps),
		});
	});
	if (stopped) return;
	if (failed !== null) throw new Error(`The handoff of ${project.title} did not finish: ${failed}`);
	if (!reported) return;
	const verdict = valueOf(await api.handoffResult(root));
	if (verdict === true) {
		const next = await deps.offer(`Ready for engineering: HANDOFF.md is on ${iteration.branch}, and nothing was pushed.`, [OPEN_PR]);
		if (next === OPEN_PR) await shareCodebase(deps, projectId);
	} else
		deps.tell(
			verdict === false
				? `${project.title} is not ready for engineering yet: its log says why.`
				: `The handoff of ${project.title} finished: its log says how it went.`,
		);
};

/** What sharing says at each step: it is a push, a pull request and a build. */
const SHARE_WORDS: Record<ShareStep, string> = {
	pushing: 'Pushing the branch…',
	opening: 'Opening a draft pull request…',
	building: 'Building the preview…',
};
/** How sharing ended: ready, with its pull request and preview, or failed, with why. */
type Shared = Extract<ShareStatus, { state: 'ready' | 'failed' }>;
const OPEN_IT = 'Open the pull request';
const COPY_IT = 'Copy the preview link';

/**
 * Codebase work shared for review (ELECTRON_MIGRATION_PLAN 5.2): the app's own share, a draft pull request whose preview
 * is built from it (`shareIteration`), said step by step as the core moves it; then the pull request and the preview's
 * link, or why it was not shared. It cannot be stopped: a push and a pull request are not taken back halfway.
 */
export const shareCodebase = async (deps: CodebaseDeps, projectId: string): Promise<void> => {
	const { api, root } = deps;
	const { project, iteration } = await codebaseOf(api, projectId);
	let outcome: Shared | null = null;
	await deps.progress(`Sharing ${project.title} for review`, async (say) => {
		const show = (status: ShareStatus) => status.state === 'running' && say(SHARE_WORDS[status.step]);
		// Listened for before it starts, so no step is missed; only this work's.
		let stop = (): void => undefined;
		const ended = new Promise<Shared>((resolve) => {
			stop = api.onShareStatus((status) => {
				if (status.state === 'idle' || status.projectId !== project.id || status.name !== iteration.name) return;
				show(status);
				if (status.state === 'ready' || status.state === 'failed') resolve(status);
			});
		});
		try {
			const started = await api.shareIteration(root, project.id, iteration.name);
			if (!started.ok) throw new Error(`${project.title} was not shared: ${started.error}`);
			show(started.value);
			outcome = started.value.state === 'ready' || started.value.state === 'failed' ? started.value : await ended;
		} finally {
			stop();
		}
	});
	const shared = outcome as Shared | null;
	if (shared === null) return;
	if (shared.state === 'failed') throw new Error(`${project.title} was not shared: ${shared.message}`);
	const next = await deps.offer(`${project.title} is shared: a draft pull request, with a preview.`, [OPEN_IT, COPY_IT]);
	if (next === OPEN_IT) await deps.openExternal(shared.prUrl);
	if (next === COPY_IT) await deps.copy(shared.url);
};

/** Codebase work on GitHub: its pull request when it has one, else its branch, in the person's browser. */
export const openCode = async (deps: CodebaseDeps, projectId: string): Promise<void> => {
	const { project, iteration } = await codebaseOf(deps.api, projectId);
	const link = codeLink(iteration);
	if (link === null) throw new Error(`The record of ${project.title}’s codebase work does not say where it is on GitHub.`);
	await deps.openExternal(link);
};
