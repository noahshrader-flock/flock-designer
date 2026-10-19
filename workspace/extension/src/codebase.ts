import type { Project, ProjectWork, ShareStatus, ShareStep, WorkspaceApi } from '../../src/shared/contract';
import { buildError, outputLines, packagesHint } from '../../src/core/services/codebase/serverOutput';
import { valueOf } from '../../src/shared/result';
import { DESIGN_MODE_COMMAND, codeLink, workOf } from '../../src/shared/work';
import { type AgentWorkDeps, type Offer, type Tell, agentReady, agentWork } from './agentWork';

export interface CodebaseDeps extends AgentWorkDeps {
	api: AgentWorkDeps['api'] &
		Pick<WorkspaceApi, 'listProjects' | 'handOff' | 'runLocally' | 'shareWork' | 'onShareStatus' | 'stopCommand' | 'onRunLog'>;
	/** The product folder that is open: where the codebase work is. */
	root: string;
	tell: Tell;
	offer: Offer;
	openExternal: (url: string) => Promise<void>;
	copy: (text: string) => Promise<void>;
}

/** A project's codebase work, read as the list has it: the project, and its work in the code. */
const codebaseOf = async (api: CodebaseDeps['api'], projectId: string): Promise<{ project: Project; work: ProjectWork }> => {
	const project = valueOf(await api.listProjects()).find((p) => p.id === projectId);
	if (!project) throw new Error(`There is no project ${projectId} here.`);
	const work = workOf(project.work, 'codebase')[0];
	if (!work) throw new Error(`${project.title} has no codebase work yet: build it in the codebase first.`);
	return { project, work };
};

const OPEN_PR = 'Open a draft pull request';

/**
 * Handoff, from VS Code (ELECTRON_MIGRATION_PLAN 5.2): the core's (`handOff`) on the project's codebase work, on its
 * branch: the product's gate, both reviews, the fixes, HANDOFF.md committed, nothing pushed. Said and stoppable as a build
 * is, its log beside the editor; then the verdict, and when it is ready, a draft pull request.
 */
export const handOff = async (deps: CodebaseDeps, projectId: string): Promise<void> => {
	const { api, root } = deps;
	await agentReady(api);
	const { project, work } = await codebaseOf(api, projectId);
	let ended: Awaited<ReturnType<typeof api.handOff>> | null = null;
	const { stopped } = await agentWork(deps, { title: `Handing off ${project.title}`, logTitle: `${project.title}: handoff` }, async (say) => {
		say('Running the product’s gate, both reviews and the fixes. This takes a while.');
		ended = await api.handOff(root, project.id);
	});
	const outcome = ended as Awaited<ReturnType<typeof api.handOff>> | null;
	if (stopped || outcome === null) return;
	if (!outcome.ok) throw new Error(`The handoff of ${project.title} did not finish: ${outcome.error}`);
	if (outcome.value.state === 'stopped') return;
	const verdict = outcome.value.value.ready;
	if (verdict === true) {
		const next = await deps.offer(`Ready for engineering: HANDOFF.md is on ${work.branch}, and nothing was pushed.`, [OPEN_PR]);
		if (next === OPEN_PR) await shareCodebase(deps, projectId);
	} else
		deps.tell(
			verdict === false
				? `${project.title} is not ready for engineering yet: its log says why.`
				: `The handoff of ${project.title} finished: its log says how it went.`,
		);
};

const STOP = 'Stop';

/** What Run locally needs of the product and this machine: how the product runs, and what is already here. */
export interface LocalRun {
	/** The port the product says its command serves on (its `.dsnr/workspace.json`), or null when it declares none. */
	port: (commandId: string) => number | null;
	/** The product's own install command, as words, for a message that its packages may be out of date; null when none. */
	installCommand: () => string | null;
	/** Whether something already answers on a port. */
	answers: (port: number) => Promise<boolean>;
	/** The page loaded out of sight for a moment: null when it drew, else what went wrong (its error, or that it drew nothing). */
	loads: (url: string) => Promise<string | null>;
}

/**
 * Run locally (VIEW_LOCALLY_PLAN): codebase work run on this machine, the way the product says it runs (its design mode, on
 * mock data), and opened in the person's own browser at its route. Its own earlier run is stopped first, so there is only
 * one; a port something else already answers on is refused. The checkout is moved to the branch as a build moves it (a
 * checkout with uncommitted changes is not moved). "Up" is checked, not assumed: a build error in the server's output, or a
 * page that errors or draws nothing in the browser out of sight, is a failure, the server stopped and nothing opened.
 */
export const runLocally = async (deps: CodebaseDeps, local: LocalRun, projectId: string): Promise<void> => {
	const { api, root } = deps;
	const { project, work } = await codebaseOf(api, projectId);
	const couldNot = (why: string) => new Error(`${project.title} couldn’t run locally: ${why}`);
	await api.stopCommand(root, DESIGN_MODE_COMMAND);
	const port = local.port(DESIGN_MODE_COMMAND);
	if (port === null) throw couldNot(`the product’s .dsnr/workspace.json declares no ${DESIGN_MODE_COMMAND} command with a port.`);
	if (await local.answers(port)) throw couldNot(`something else is already answering on port ${port}. Stop it, then try again.`);
	const lines: string[] = [];
	deps.log.start(`${project.title}, locally`);
	const listening = api.onRunLog((l) => {
		if (l.commandId !== DESIGN_MODE_COMMAND) return;
		for (const line of outputLines(l.text)) {
			lines.push(line);
			deps.log.line(line);
		}
	});
	let url: string | null = null;
	let failed: string | null = null;
	let stopped = false;
	try {
		await deps.progress(
			`Starting ${project.title} locally`,
			async (say) => {
				say('Opening its branch and starting its dev server…');
				const ran = await api.runLocally(root, project.id, work.name);
				if (ran.ok) url = ran.value.url;
				else failed = ran.error;
				if (stopped) return;
				if (url !== null && failed === null) {
					say('Checking that it loads…');
					// The output is read before and after the page is: a server can answer before it prints its build error.
					failed = buildError(lines) ?? (await local.loads(url)) ?? buildError(lines);
				}
			},
			() => {
				stopped = true;
				void api.stopCommand(root, DESIGN_MODE_COMMAND);
			},
		);
	} finally {
		listening();
	}
	if (stopped) return;
	if (failed !== null || url === null) {
		await api.stopCommand(root, DESIGN_MODE_COMMAND);
		const why: string = failed ?? 'it gave no address.';
		const hint = packagesHint(why, local.installCommand());
		throw couldNot(hint && !/[.!?]$/.test(why) ? `${why}.${hint}` : `${why}${hint}`);
	}
	const at: string = url;
	// Started, so stopped again if it cannot be shown: never left running with no Stop to press.
	try {
		await deps.openExternal(at);
	} catch (err) {
		await api.stopCommand(root, DESIGN_MODE_COMMAND);
		throw new Error(
			`${project.title} is running locally at ${at}, but it could not be opened in the browser: ${err instanceof Error ? err.message : String(err)}`,
		);
	}
	// A record with no route opens at the front door: said, so nobody takes it for the page that changed.
	const where = work.route ? '' : ' Its record names no page for this work, so it opened at the app’s front door.';
	if ((await deps.offer(`${project.title} is running locally at ${at}.${where}`, [STOP])) === STOP)
		valueOf(await api.stopCommand(root, DESIGN_MODE_COMMAND));
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
 * Codebase work shared for review (ELECTRON_MIGRATION_PLAN 5.2): the core's share, a draft pull request whose preview
 * is built from it (`shareWork`), said step by step as the core moves it; then the pull request and the preview's
 * link, or why it was not shared. It cannot be stopped: a push and a pull request are not taken back halfway.
 */
export const shareCodebase = async (deps: CodebaseDeps, projectId: string): Promise<void> => {
	const { api, root } = deps;
	const { project, work } = await codebaseOf(api, projectId);
	let outcome: Shared | null = null;
	await deps.progress(`Sharing ${project.title} for review`, async (say) => {
		const show = (status: ShareStatus) => status.state === 'running' && say(SHARE_WORDS[status.step]);
		// Listened for before it starts, so no step is missed; only this work's.
		let stop = (): void => undefined;
		const ended = new Promise<Shared>((resolve) => {
			stop = api.onShareStatus((status) => {
				if (status.state === 'idle' || status.projectId !== project.id || status.name !== work.name) return;
				show(status);
				if (status.state === 'ready' || status.state === 'failed') resolve(status);
			});
		});
		try {
			const started = await api.shareWork(root, project.id, work.name);
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
	const { project, work } = await codebaseOf(deps.api, projectId);
	const link = codeLink(work);
	if (link === null) throw new Error(`The record of ${project.title}’s codebase work does not say where it is on GitHub.`);
	await deps.openExternal(link);
};
