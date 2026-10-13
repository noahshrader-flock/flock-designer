import { runPrototypeBuild, type PrototypeApi } from '../../src/renderer/runPrototypeBuild';
import type { BuildPhase } from '../../src/renderer/localBuild';
import { foldersOf } from '../../src/shared/brief';
import type { Project, WorkspaceApi } from '../../src/shared/contract';
import { toProjectIteration } from '../../src/shared/iterationRecords';
import { valueOf } from '../../src/shared/result';
import { slugify } from '../../src/shared/validate';
import { type Review, reviewsOf } from './messages';

/** VS Code's own boxes, as the flow asks them: a line of text, and one of a list. Undefined when the person dismisses it. */
export interface Ask {
	text(o: { title: string; prompt: string; placeholder?: string; validate?: (value: string) => string | null }): Promise<string | undefined>;
	pick<T>(o: { title: string; placeholder: string; items: { label: string; description?: string; value: T }[] }): Promise<T | undefined>;
}

/**
 * Work that takes a while, in VS Code's notification: `title`, then what `task` says as it goes; `onStop` when the person
 * presses its Stop.
 */
export type Progress = (title: string, task: (say: (message: string) => void) => Promise<void>, onStop: () => void) => Promise<void>;

export interface NewPrototypeDeps {
	api: PrototypeApi &
		Pick<
			WorkspaceApi,
			| 'agentReadiness'
			| 'prototypeReadiness'
			| 'installPackages'
			| 'cancelInstall'
			| 'onInstallLine'
			| 'listProjects'
			| 'readCheckout'
			| 'createPrototype'
			| 'stopAgent'
			| 'onAgentLog'
		>;
	/** The product folder that is open, or why there is none (from the context). */
	product: { root: string | null; why: string };
	ask: Ask;
	/** A warning with what can be done about it; the action pressed, or undefined. */
	choose: (message: string, actions: string[]) => Promise<string | undefined>;
	progress: Progress;
	/** Where the agent's log is: started afresh, and shown, for a piece of work, then a line at a time. */
	log: { start: (title: string) => void; line: (text: string) => void };
	/** Told once it is made, before it is built, so the projects list shows it while it is. */
	onMade: () => void;
	openReview: (review: Review) => Promise<void>;
	/** Answers the command was given (`readGiven`), so only what is not given is asked. */
	given?: Given;
	/** How often the agent is asked how it is getting on. */
	pollMs?: number;
}

/** What DSNR: New prototype may be given, from a keybinding, another extension or a test: its answers, as text. */
export interface Given {
	title?: string;
	task?: string;
	folder?: string | null;
}

const LONGEST = 4000;
const text = (v: unknown): v is string => typeof v === 'string' && v.length <= LONGEST;

/** The answers in what a command was given, each only when it is text of a sensible length; anything else is ignored. */
export const readGiven = (raw: unknown): Given => {
	if (typeof raw !== 'object' || raw === null) return {};
	const r = raw as Record<string, unknown>;
	return {
		...(text(r.title) ? { title: r.title } : {}),
		...(text(r.task) ? { task: r.task } : {}),
		...(r.folder === null || text(r.folder) ? { folder: r.folder } : {}),
	};
};

const INSTALL = 'Install packages';
const NEW_FOLDER = '$(add) New folder…';

/** What the notification says at each step of the build. */
const PHASE_WORDS: Partial<Record<BuildPhase['kind'], string>> = {
	agent: 'The agent is writing it from your request. This takes a few minutes.',
	preview: 'Opening it…',
};
const wordsFor = (phase: BuildPhase): string | undefined =>
	phase.kind === 'agent' && phase.accessibility ? 'Fixing what the accessibility check found…' : PHASE_WORDS[phase.kind];

/** Claude Code builds it: said when it is not here, or not signed in. */
const agentReady = async (api: NewPrototypeDeps['api']): Promise<void> => {
	const { state } = valueOf(await api.agentReadiness());
	if (state === 'missing')
		throw new Error(
			'Claude Code is not installed. New work is built by Claude Code on this machine: install it from claude.com/claude-code, sign in, then start again.',
		);
	if (state === 'signedOut')
		throw new Error('Claude Code is not signed in. Sign in in the Claude Code panel, or by running claude in a terminal, then start again.');
};

/** The product's packages, with its design system, installed: installed here when the person asks and the product says how. */
const packagesReady = async ({ api, choose, progress }: NewPrototypeDeps, root: string): Promise<boolean> => {
	const readiness = valueOf(await api.prototypeReadiness(root));
	if (readiness.ready) return true;
	if (readiness.why === 'no-bundler') throw new Error('DSNR cannot build pages on this machine. Reinstall DSNR and try again.');
	if (!readiness.canInstall)
		throw new Error(
			`A prototype is built from ${readiness.designSystem}, and it is not installed in ${readiness.repository} on this machine. Run npm ci in it (this needs access to the private packages), then start again.`,
		);
	const asked = await choose(
		`A prototype is built from ${readiness.designSystem}, and ${readiness.repository}'s packages are not installed on this machine yet.`,
		[INSTALL],
	);
	if (asked !== INSTALL) return false;
	let stopped = false;
	await progress(
		`Installing ${readiness.repository}'s packages`,
		async (say) => {
			const stop = api.onInstallLine(say);
			try {
				const installed = await api.installPackages(root);
				if (!installed.ok && !stopped) throw new Error(installed.error);
			} finally {
				stop();
			}
		},
		() => {
			stopped = true;
			void api.cancelInstall();
		},
	);
	if (stopped) return false;
	const again = valueOf(await api.prototypeReadiness(root));
	if (!again.ready) throw new Error(`The packages were installed, but ${readiness.designSystem} is still not there.`);
	return true;
};

/** Its name and what it explores, as the boxes ask them. */
type Question = Parameters<Ask['text']>[0] & { validate: (value: string) => string | null };
const NAME: Question = {
	title: 'New prototype: its name',
	prompt: 'Name it',
	placeholder: 'Alert history',
	validate: (v) => (slugify(v) ? null : 'Give it a name with a letter or a number.'),
};
const TASK: Question = {
	title: 'New prototype: what it explores',
	prompt: 'What should it explore?',
	placeholder: 'A history of alerts, filterable by camera and by day',
	validate: (v) => (v.trim() ? null : 'Say what it should explore.'),
};

/** The answer given, held to what the box would take, or asked in the box. Undefined when the person dismisses it. */
const answer = async (given: string | undefined, question: Question, ask: Ask): Promise<string | undefined> => {
	if (given === undefined) return ask.text(question);
	const why = question.validate(given);
	if (why !== null) throw new Error(why);
	return given;
};

/** Its folder: one there is, none, or a new one named here. Undefined when the person dismisses it. */
const folderFor = async (ask: Ask, projects: Project[]): Promise<string | null | undefined> => {
	const picked = await ask.pick<string | null | typeof NEW_FOLDER>({
		title: 'New prototype: its folder',
		placeholder: 'Which folder it goes in',
		items: [
			{ label: 'No folder', value: null },
			...foldersOf(projects).map((f) => ({ label: f, value: f })),
			{ label: NEW_FOLDER, value: NEW_FOLDER },
		],
	});
	if (picked !== NEW_FOLDER) return picked;
	const named = await ask.text({
		title: 'New prototype: a new folder',
		prompt: 'Name the folder',
		validate: (v) => (v.trim() ? null : 'Name the folder.'),
	});
	return named === undefined ? undefined : named.trim();
};

/**
 * Starting a prototype, the designer's loop in VS Code (ELECTRON_MIGRATION_PLAN 4.1). What stands in the way is said
 * first, before anything is made: no product open, Claude Code missing or signed out, the packages not installed (with
 * Install, when the product says how). Then its name, what it should explore and its folder, in VS Code's own boxes; it
 * starts from the branch the product is on. Then the app's own build (`runPrototypeBuild`), said in a notification with
 * Stop and its log shown as it goes, and when it is saved, its review opens.
 */
export const newPrototype = async (deps: NewPrototypeDeps): Promise<void> => {
	const { api, product, ask } = deps;
	if (product.root === null) throw new Error(product.why);
	await agentReady(api);
	if (!(await packagesReady(deps, product.root))) return;

	const given = deps.given ?? {};
	const title = await answer(given.title, NAME, ask);
	if (title === undefined) return;
	const task = await answer(given.task, TASK, ask);
	if (task === undefined) return;
	const folder = given.folder !== undefined ? given.folder : await folderFor(ask, valueOf(await api.listProjects()));
	if (folder === undefined) return;

	const { root, branch } = valueOf(await api.readCheckout(product.root));
	if (branch === null) throw new Error('The product is not on a branch: check one out, then start again.');
	const made = valueOf(await api.createPrototype(slugify(title), title.trim(), task.trim(), { root, branch }, folder));
	deps.onMade();
	const iteration = toProjectIteration(made);
	const project: Project = { id: made.projectId, title: title.trim(), folder, records: [], iterations: [iteration], people: [] };
	await build(deps, project, task.trim());
};

/** The build, said as it goes and stoppable, its log shown: its review opened when it is saved, or how it failed thrown. */
const build = async (deps: NewPrototypeDeps, project: Project, task: string): Promise<void> => {
	const { api, progress, log } = deps;
	const iteration = project.iterations[0]!;
	let stopped = false;
	let failed: string | null = null;
	let opened: string | null = null;
	log.start(project.title);
	const listening = api.onAgentLog((l) => log.line(l.text.replace(/\n$/, '')));
	try {
		await progress(
			`Building ${project.title}`,
			async (say) => {
				opened = await runPrototypeBuild({
					api,
					project,
					iteration,
					task,
					isLive: () => !stopped,
					onPhase: (phase) => {
						if (phase.kind === 'failed') failed = phase.message;
						const words = wordsFor(phase);
						if (words) say(words);
					},
					...(deps.pollMs !== undefined ? { pollMs: deps.pollMs } : {}),
				});
			},
			() => {
				stopped = true;
				void api.stopAgent();
			},
		);
	} finally {
		listening();
	}
	if (stopped) return;
	// Said as any failure is; its log is already beside the editor.
	if (failed !== null) throw new Error(`${project.title} was not built: ${failed}`);
	const review = reviewsOf(project)[0];
	if (opened !== null && review) await deps.openReview(review);
};
