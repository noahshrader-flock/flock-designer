import type { HandoffResult, Project, ProjectWork, ShareStatus, ShareStep, WorkspaceApi } from '../../src/shared/contract';
import { buildError, outputLines, packagesHint } from '../../src/core/services/codebase/serverOutput';
import { handedTo } from '../../src/shared/handedTo';
import { handoffReady } from '../../src/shared/handoff';
import { valueOf } from '../../src/shared/result';
import { DESIGN_MODE_COMMAND, codeLink, workOf } from '../../src/shared/work';
import type { Offer, OutputLike, Progress, Tell } from './say';

export interface CodebaseDeps {
	progress: Progress;
	log: OutputLike;
	api: Pick<
		WorkspaceApi,
		'listProjects' | 'handOff' | 'handoffResult' | 'handCodebaseUpdate' | 'runLocally' | 'shareWork' | 'onShareStatus' | 'stopCommand' | 'onRunLog'
	>;
	root: string;
	tell: Tell;
	offer: Offer;
	openExternal: (url: string) => Promise<void>;
	copy: (text: string) => Promise<void>;
	/** Asks `check` until it says it is done, as a handed build is watched. */
	watch: (check: () => Promise<boolean>) => void;
}

const codebaseOf = async (api: CodebaseDeps['api'], projectId: string): Promise<{ project: Project; work: ProjectWork }> => {
	const project = valueOf(await api.listProjects()).find((p) => p.id === projectId);
	if (!project) throw new Error(`There is no project ${projectId} here.`);
	const work = workOf(project.work, 'codebase')[0];
	if (!work) throw new Error(`${project.title} has no codebase work yet: build it in the codebase first.`);
	return { project, work };
};

const OPEN_PR = 'Open a draft pull request';

const reportHandoff = async (
	deps: CodebaseDeps,
	project: Project,
	branch: string,
	result: Extract<HandoffResult, { state: 'done' }>,
): Promise<void> => {
	const flags = [
		...(result.pushed ? [`The agent pushed ${branch}, which a handoff never does: look at what reached GitHub.`] : []),
		...(result.outside.length ? [`It changed files a handoff leaves alone: ${result.outside.join(', ')}.`] : []),
	];
	if (handoffReady(result)) {
		const next = await deps.offer([`Ready for engineering: HANDOFF.md is on ${branch}, and nothing was pushed.`, ...flags].join(' '), [OPEN_PR]);
		if (next === OPEN_PR) await shareCodebase(deps, project.id);
		return;
	}
	const said = {
		ready: `HANDOFF.md says ${project.title} is ready, but it is not recorded as ready.`,
		'not ready': `${project.title} is not ready for engineering yet: HANDOFF.md says why.`,
		neither: `HANDOFF.md is committed on ${branch}, but its first line says neither Ready for engineering nor Not ready.`,
	}[result.verdict ?? 'neither'];
	deps.tell([said, ...flags].join(' '));
};

/** Hands the task over; the person runs it in the agent's window, and the verdict is read from HANDOFF.md once committed. */
export const handOff = async (deps: CodebaseDeps, projectId: string): Promise<void> => {
	const { api, root } = deps;
	const { project, work } = await codebaseOf(api, projectId);
	const handed = valueOf(await api.handOff(root, project.id));
	deps.watch(async () => {
		const result = valueOf(await api.handoffResult(root, project.id));
		if (result.state === 'waiting') return false;
		if (result.state === 'done') await reportHandoff(deps, project, work.branch, result);
		return true;
	});
	deps.tell(`${handedTo(handed, `The handoff of ${project.title}`)} When HANDOFF.md is committed on ${work.branch}, DSNR says whether it is ready.`);
};

/** Update this branch: the agent merges the base in, in this window; DSNR only kept where the branch was. */
export const updateBranch = async (deps: CodebaseDeps, projectId: string): Promise<void> => {
	const { api, root } = deps;
	const { work } = await codebaseOf(api, projectId);
	const handed = valueOf(await api.handCodebaseUpdate(root, projectId));
	deps.tell(
		`${handedTo(handed, `Bringing ${work.branch} up to date`)} Nothing is merged until it does it there; DSNR kept where the branch was, so the update can be undone.`,
	);
};

const STOP = 'Stop';

export interface LocalRun {
	/** Null when the product declares none. */
	port: (commandId: string) => number | null;
	installCommand: () => string | null;
	answers: (port: number) => Promise<boolean>;
	/** Null when the page drew, else what went wrong (its error, or that it drew nothing). */
	loads: (url: string) => Promise<string | null>;
}

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

const SHARE_WORDS: Record<ShareStep, string> = {
	pushing: 'Pushing the branch…',
	opening: 'Opening a draft pull request…',
	building: 'Building the preview…',
};
type Shared = Extract<ShareStatus, { state: 'ready' | 'failed' }>;
const OPEN_IT = 'Open the pull request';
const COPY_IT = 'Copy the preview link';

/** It cannot be stopped: a push and a pull request are not taken back halfway. */
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

export const openCode = async (deps: CodebaseDeps, projectId: string): Promise<void> => {
	const { project, work } = await codebaseOf(deps.api, projectId);
	const link = codeLink(work);
	if (link === null) throw new Error(`The record of ${project.title}’s codebase work does not say where it is on GitHub.`);
	await deps.openExternal(link);
};
