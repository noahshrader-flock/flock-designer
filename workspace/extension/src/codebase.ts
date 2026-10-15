import { type BuildApi, type BuildPhase, previewCommandFor, runLocalBuild } from '../../src/renderer/localBuild';
import type { Project, ProjectIteration, ShareStatus, ShareStep, WorkspaceApi } from '../../src/shared/contract';
import { valueOf } from '../../src/shared/result';
import { codeLink, workOf } from '../../src/shared/work';
import { type AgentWorkDeps, type Offer, type Tell, agentReady, agentWork, pollOf } from './agentWork';

export interface CodebaseDeps extends AgentWorkDeps {
	api: AgentWorkDeps['api'] &
		BuildApi &
		Pick<WorkspaceApi, 'listProjects' | 'handoffResult' | 'shareIteration' | 'onShareStatus' | 'stopCommand' | 'onRunLog'>;
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

const STOP = 'Stop';

/** What View locally needs of the product and this machine: how the product runs, and what is already here. */
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

const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');
/** The line of a server's output that says why its build failed, if one does. */
const buildError = (lines: string[]): string | null => {
	// The bundler's list of what a package does export is long and says nothing the person needs: it is cut.
	const bare = lines
		.map((l) =>
			l
				.replace(ANSI, '')
				.replace(/^\s*[×✖]\s*/, '')
				.replace(/\s*\(possible exports:.*$/, '')
				.trim(),
		)
		.filter(Boolean);
	const failed = bare.some((l) => /build failed|failed to compile|build error/i.test(l));
	if (!failed) return null;
	return (
		bare.find(
			(l) =>
				/(Error|error TS\d+|Module not found|was not found in|Cannot find module)/.test(l) &&
				!/^error\s+build (failed|error)/i.test(l) &&
				!/^error\s+Build error:?$/i.test(l),
		) ?? 'its build failed.'
	);
};
/** Said when an error names a package export or module that is not there: the product's packages are older than its code. */
const packagesHint = (reason: string, install: string | null): string =>
	/was not found in '[^']+'|has no exported member|Cannot find module '[^']+'/.test(reason)
		? ` Its packages may be out of date${install ? `: ${install}` : '.'}`
		: '';

/**
 * View locally (VIEW_LOCALLY_PLAN): codebase work run on this machine, the way the product says it runs (its design mode, on
 * mock data), and opened in the person's own browser at its route. Its own earlier run is stopped first, so there is only
 * one; a port something else already answers on is refused. The checkout is moved to the branch as a build moves it (a
 * checkout with uncommitted changes is not moved). "Up" is checked, not assumed: a build error in the server's output, or a
 * page that errors or draws nothing in the browser out of sight, is a failure, the server stopped and nothing opened.
 */
export const viewLocally = async (deps: CodebaseDeps, local: LocalRun, projectId: string): Promise<void> => {
	const { api, root } = deps;
	const { project, iteration } = await codebaseOf(api, projectId);
	const command = previewCommandFor(iteration);
	const couldNot = (why: string) => new Error(`${project.title} couldn’t load locally: ${why}`);
	await api.stopCommand(root, command);
	const port = local.port(command);
	if (port === null) throw couldNot(`the product’s .dsnr/workspace.json declares no ${command} command with a port.`);
	if (await local.answers(port)) throw couldNot(`something else is already answering on port ${port}. Stop it, then try again.`);
	const lines: string[] = [];
	deps.log.start(`${project.title}, locally`);
	const listening = api.onRunLog((l) => {
		if (l.commandId !== command) return;
		for (const line of l.text.split('\n').filter((x) => x.trim() !== '')) {
			lines.push(line);
			deps.log.line(line.replace(ANSI, ''));
		}
	});
	let url: string | null = null;
	let failed: string | null = null;
	let stopped = false;
	try {
		await deps.progress(
			`Starting ${project.title} locally`,
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
					...pollOf(deps),
				});
				if (url !== null && failed === null) {
					say('Checking that it loads…');
					// The output is read before and after the page is: a server can answer before it prints its build error.
					failed = buildError(lines) ?? (await local.loads(url)) ?? buildError(lines);
				}
			},
			() => {
				stopped = true;
				void api.stopCommand(root, command);
			},
		);
	} finally {
		listening();
	}
	if (stopped) return;
	if (failed !== null || url === null) {
		await api.stopCommand(root, command);
		const why: string = failed ?? 'it gave no address.';
		const hint = packagesHint(why, local.installCommand());
		throw couldNot(hint && !/[.!?]$/.test(why) ? `${why}.${hint}` : `${why}${hint}`);
	}
	const at: string = url;
	await deps.openExternal(at);
	if ((await deps.offer(`${project.title} is running locally at ${at}.`, [STOP])) === STOP) valueOf(await api.stopCommand(root, command));
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
