import type { WorkspaceApi } from '../../src/shared/contract';
import { valueOf } from '../../src/shared/result';
import { slugify } from '../../src/shared/validate';
import { handedTo } from '../../src/shared/handedTo';
import { type AgentWorkDeps, type Offer, type Tell } from './agentWork';
import { LIMITS } from './messages';

export interface NewPrototypeDeps extends Pick<AgentWorkDeps, 'progress'> {
	api: Pick<
		WorkspaceApi,
		'prototypeReadiness' | 'installPackages' | 'cancelInstall' | 'onInstallLine' | 'readCheckout' | 'createPrototype' | 'handPrototypeBuild'
	>;
	/** The product folder that is open, or why there is none (from the context). */
	product: { root: string | null; why: string };
	/** A warning with what can be done about it. */
	choose: Offer;
	/** Says where the build went, in VS Code's notification, without waiting on anyone. */
	tell: Tell;
	/** Told when the projects changed: once it is made, so the list shows it while it is built. */
	onChanged: () => void;
	/** Starts watching for its build to be done, to save it and have the list read again (`watchBuild`); not waited for. */
	watchBuild: (projectId: string, name: string) => void;
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

/**
 * What DSNR: New prototype was called with: the dialog to ask (`'ask'`), the answers code gave (`Given`), or null when
 * code meant to give answers and they are wrong. Anything else is a request to ask: VS Code hands a command run from a
 * title bar or a menu an argument of its own, which must never be taken for a badly made request.
 */
export const readAsked = (raw: unknown): 'ask' | Given | null => {
	const meant = typeof raw === 'object' && raw !== null && !Array.isArray(raw) && ('title' in raw || 'task' in raw);
	return meant ? readGiven(raw) : 'ask';
};

const INSTALL = 'Install packages';

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
 * What stands in the way of starting at all, said before the person is asked anything: no product open. (The product's
 * packages come after, as they can be installed from here. Claude Code is not asked after: with none in this VS Code, the
 * command that starts it in a terminal is what the person is given.)
 */
export const readyToStart = async ({ product }: Pick<NewPrototypeDeps, 'product'>): Promise<void> => {
	if (product.root === null) throw new Error(product.why);
};

/**
 * Starting a prototype in VS Code, from what the panel's dialog asked (`given`): what stands in the way is said first,
 * then it is made on the product's branch and its building handed to Claude Code in this window, a conversation for the
 * person to start and watch. DSNR builds nothing itself; it saves the build when it is done (`watchBuild`).
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
	const handed = valueOf(await api.handPrototypeBuild(root, made.projectId, made.name, task));
	deps.watchBuild(made.projectId, made.name);
	deps.tell(`${handedTo(handed, title)} DSNR saves it when it is built, and its picture appears in the list.`);
};
