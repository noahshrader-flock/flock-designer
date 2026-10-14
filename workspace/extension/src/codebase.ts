import { type BuildApi, type BuildPhase, previewCommandFor, runLocalBuild } from '../../src/renderer/localBuild';
import type { Project, ProjectIteration, ShareStatus, ShareStep, WorkspaceApi } from '../../src/shared/contract';
import { valueOf } from '../../src/shared/result';
import { codeLink, workOf } from '../../src/shared/work';
import { type AgentWorkDeps, agentReady, agentWork } from './agentWork';

export interface CodebaseDeps extends AgentWorkDeps {
	api: AgentWorkDeps['api'] & BuildApi & Pick<WorkspaceApi, 'listProjects' | 'handoffResult' | 'shareIteration' | 'onShareStatus' | 'stopCommand'>;
	/** The product folder that is open: where the codebase work is. */
	root: string;
	/** Says how something went, without waiting on anyone. */
	tell: (message: string) => void;
	/** Says how something went, with what can be done next; the action pressed, or undefined. */
	offer: (message: string, actions: string[]) => Promise<string | undefined>;
	openExternal: (url: string) => Promise<void>;
	copy: (text: string) => Promise<void>;
	/** How often the agent is asked how it is getting on. */
	pollMs?: number;
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
			...(deps.pollMs !== undefined ? { pollMs: deps.pollMs } : {}),
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

const STOP = 'Stop it';

/**
 * The preview of codebase work (ELECTRON_MIGRATION_PLAN 5.3): the branch's own dev server, started as the app starts it
 * (`runLocalBuild`: the checkout moved to the branch first, at its recorded route), opened in the person's browser, since
 * there are no pins on codebase work. Said, with Stop, until it is up; then where it is, and Stop it.
 */
export const previewCodebase = async (deps: CodebaseDeps, projectId: string): Promise<void> => {
	const { api, root } = deps;
	const { project, iteration } = await codebaseOf(api, projectId);
	const command = previewCommandFor(iteration);
	let url: string | null = null;
	let failed: string | null = null;
	let stopped = false;
	await deps.progress(
		`Starting the preview of ${project.title}`,
		async (say) => {
			url = await runLocalBuild({
				api,
				root,
				project,
				iteration,
				isLive: () => !stopped,
				onPhase: (phase: BuildPhase) => {
					if (phase.kind === 'preview') say('Starting its dev server…');
					if (phase.kind === 'failed') failed = phase.message;
				},
				...(deps.pollMs !== undefined ? { pollMs: deps.pollMs } : {}),
			});
		},
		() => {
			stopped = true;
			void api.stopCommand(root, command);
		},
	);
	if (stopped) return;
	if (failed !== null || url === null) throw new Error(`The preview of ${project.title} did not start: ${failed ?? 'it gave no address.'}`);
	const at: string = url;
	await deps.openExternal(at);
	if ((await deps.offer(`The preview of ${project.title} is running at ${at}.`, [STOP])) === STOP) valueOf(await api.stopCommand(root, command));
};

/** What sharing says at each step: it is a push, a pull request and a build. */
const SHARE_WORDS: Record<ShareStep, string> = {
	pushing: 'Pushing the branch…',
	opening: 'Opening a draft pull request…',
	building: 'Building the preview…',
};
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
	let ended: Extract<ShareStatus, { state: 'ready' | 'failed' }> | null = null;
	await deps.progress(`Sharing ${project.title} for review`, async (say) => {
		await new Promise<void>((resolve, reject) => {
			const show = (status: ShareStatus) => {
				if (status.state === 'running') say(SHARE_WORDS[status.step]);
				if (status.state === 'ready' || status.state === 'failed') {
					ended = status;
					stop();
					resolve();
				}
			};
			// Listened for before it starts, so no step is missed.
			const stop = api.onShareStatus((s) => s.state !== 'idle' && s.projectId === project.id && s.name === iteration.name && show(s));
			void api.shareIteration(root, project.id, iteration.name).then((started) => {
				if (!started.ok) {
					stop();
					return reject(new Error(started.error));
				}
				show(started.value);
			}, reject);
		}).catch((err: unknown) => {
			ended = { state: 'failed', projectId: project.id, name: iteration.name, message: err instanceof Error ? err.message : String(err) };
		});
	});
	const outcome = ended as Extract<ShareStatus, { state: 'ready' | 'failed' }> | null;
	if (outcome === null) return;
	if (outcome.state === 'failed') throw new Error(`${project.title} was not shared: ${outcome.message}`);
	const next = await deps.offer(`${project.title} is shared: a draft pull request, with a preview.`, [OPEN_IT, COPY_IT]);
	if (next === OPEN_IT) await deps.openExternal(outcome.prUrl);
	if (next === COPY_IT) await deps.copy(outcome.url);
};

/** Codebase work on GitHub: its pull request when it has one, else its branch, in the person's browser. */
export const openCode = async (deps: CodebaseDeps, projectId: string): Promise<void> => {
	const { project, iteration } = await codebaseOf(deps.api, projectId);
	const link = codeLink(iteration);
	if (link === null) throw new Error(`The record of ${project.title}’s codebase work does not say where it is on GitHub.`);
	await deps.openExternal(link);
};
