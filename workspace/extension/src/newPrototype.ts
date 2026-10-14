import { runPrototypeBuild, type PrototypeApi } from '../../src/renderer/runPrototypeBuild';
import type { BuildPhase } from '../../src/renderer/localBuild';
import type { Project, WorkspaceApi } from '../../src/shared/contract';
import { toProjectIteration } from '../../src/shared/iterationRecords';
import { valueOf } from '../../src/shared/result';
import { slugify } from '../../src/shared/validate';
import { type AgentWorkDeps, type Offer, agentReady, agentWork, pollOf } from './agentWork';
import { LIMITS, type Review, reviewsOf } from './messages';

export interface NewPrototypeDeps extends AgentWorkDeps {
	api: AgentWorkDeps['api'] &
		PrototypeApi &
		Pick<WorkspaceApi, 'prototypeReadiness' | 'installPackages' | 'cancelInstall' | 'onInstallLine' | 'readCheckout' | 'createPrototype'>;
	/** The product folder that is open, or why there is none (from the context). */
	product: { root: string | null; why: string };
	/** A warning with what can be done about it. */
	choose: Offer;
	/** Told when the projects changed: once it is made, so the list shows it while it is built, and once it is built. */
	onChanged: () => void;
	openReview: (review: Review) => Promise<void>;
	/** What to make: its name, what it explores and its folder, from the panel's dialog or from code (`readGiven`). */
	given: Given;
}

/** What a prototype is made from: its name, what it explores, and its folder (none: null). */
export interface Given {
	title: string;
	task: string;
	folder: string | null;
}

/** Text of at most `most` characters, or not. */
const within = (v: unknown, most: number): v is string => typeof v === 'string' && v.length <= most;

/**
 * What DSNR: New prototype was given by code (a keybinding, another extension, a test): its name and what it explores,
 * and its folder if it has one, each as text within the limits the panel's message has (`LIMITS`); null when it lacks
 * either, or any is over, and anything more is ignored. The panel's dialog sends the same.
 */
export const readGiven = (raw: unknown): Given | null => {
	if (typeof raw !== 'object' || raw === null) return null;
	const r = raw as Record<string, unknown>;
	const folder = r.folder === undefined || r.folder === null ? null : within(r.folder, LIMITS.folder) ? r.folder : undefined;
	return within(r.title, LIMITS.title) && within(r.task, LIMITS.task) && folder !== undefined ? { title: r.title, task: r.task, folder } : null;
};

const INSTALL = 'Install packages';

/** What the notification says at each step of the build. */
const PHASE_WORDS: Partial<Record<BuildPhase['kind'], string>> = {
	agent: 'The agent is writing it from your request. This takes a few minutes.',
	preview: 'Opening it…',
};
const wordsFor = (phase: BuildPhase): string | undefined =>
	phase.kind === 'agent' && phase.accessibility ? 'Fixing what the accessibility check found…' : PHASE_WORDS[phase.kind];

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

/**
 * What stands in the way of starting at all, said before the person is asked anything: no product open, Claude Code
 * missing or signed out. (The product's packages come after, as they can be installed from here.)
 */
export const readyToStart = async ({ api, product }: Pick<NewPrototypeDeps, 'api' | 'product'>): Promise<void> => {
	if (product.root === null) throw new Error(product.why);
	await agentReady(api);
};

/**
 * Starting a prototype, the designer's loop in VS Code (ELECTRON_MIGRATION_PLAN 4.1), from what the panel's dialog asked
 * (`given`): what stands in the way is said first (`readyToStart`, then the packages not installed, with Install, when the
 * product says how). It starts from the branch the product is on. Then the app's own build (`runPrototypeBuild`), said
 * in a notification with Stop and its log shown as it goes, and when it is saved, its review opens.
 */
export const newPrototype = async (deps: NewPrototypeDeps): Promise<void> => {
	const { api, product, given } = deps;
	await readyToStart(deps);
	const root = product.root as string;
	if (slugify(given.title) === '') throw new Error('Give it a name with a letter or a number.');
	if (given.task.trim() === '') throw new Error('Say what it should explore.');
	if (!(await packagesReady(deps, root))) return;

	const title = given.title.trim();
	const task = given.task.trim();
	const checkout = valueOf(await api.readCheckout(root));
	if (checkout.branch === null) throw new Error('The product is not on a branch: check one out, then start again.');
	const made = valueOf(await api.createPrototype(slugify(title), title, task, { root: checkout.root, branch: checkout.branch }, given.folder));
	deps.onChanged();
	const iteration = toProjectIteration(made);
	const project: Project = { id: made.projectId, title, folder: given.folder, records: [], iterations: [iteration], people: [] };
	await build(deps, project, task);
};

/** The build, said as it goes and stoppable, its log shown: its review opened when it is saved, or how it failed thrown. */
const build = async (deps: NewPrototypeDeps, project: Project, task: string): Promise<void> => {
	const iteration = project.iterations[0]!;
	let failed: string | null = null;
	let opened: string | null = null;
	const { stopped } = await agentWork(deps, { title: `Building ${project.title}`, logTitle: project.title }, async (say, isLive) => {
		opened = await runPrototypeBuild({
			api: deps.api,
			project,
			iteration,
			task,
			isLive,
			onPhase: (phase) => {
				if (phase.kind === 'failed') failed = phase.message;
				const words = wordsFor(phase);
				if (words) say(words);
			},
			...pollOf(deps),
		});
	});
	if (stopped) return;
	// Said as any failure is; its log is already beside the editor.
	if (failed !== null) throw new Error(`${project.title} was not built: ${failed}`);
	deps.onChanged();
	const review = reviewsOf(project)[0];
	if (opened !== null && review) await deps.openReview(review);
};
