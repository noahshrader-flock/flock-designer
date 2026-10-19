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
	/** `why` says why `root` is null. */
	product: { root: string | null; why: string };
	choose: Offer;
	tell: Tell;
	/** Told once it is made, so the list shows it while it is built. */
	onChanged: () => void;
	/** Not waited for. */
	watchBuild: (projectId: string, name: string, title: string) => void;
	given: Given;
}

export interface Given {
	title: string;
	task: string;
	folder: string | null;
}

const within = (v: unknown, most: number): v is string => typeof v === 'string' && v.length <= most;

/** Null when the title or task is missing or any field is over its limit; anything more is ignored. */
export const readGiven = (raw: unknown): Given | null => {
	if (typeof raw !== 'object' || raw === null) return null;
	const r = raw as Record<string, unknown>;
	const folder = r.folder === undefined || r.folder === null ? null : within(r.folder, LIMITS.folder) ? r.folder : undefined;
	return within(r.title, LIMITS.title) && within(r.task, LIMITS.task) && folder !== undefined ? { title: r.title, task: r.task, folder } : null;
};

/**
 * Anything without a title or task is a request to ask: VS Code hands a command run from a title bar or a menu an
 * argument of its own, which must never be taken for a badly made request.
 */
export const readAsked = (raw: unknown): 'ask' | Given | null => {
	const meant = typeof raw === 'object' && raw !== null && !Array.isArray(raw) && ('title' in raw || 'task' in raw);
	return meant ? readGiven(raw) : 'ask';
};

const INSTALL = 'Install packages';

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
 * Said before the person is asked anything. Claude Code is not checked: without it, the person is given the command that
 * starts it in a terminal.
 */
export const readyToStart = async ({ product }: Pick<NewPrototypeDeps, 'product'>): Promise<void> => {
	if (product.root === null) throw new Error(product.why);
};

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
	deps.watchBuild(made.projectId, made.name, title);
	deps.tell(`${handedTo(handed, title)} DSNR saves it when it is built, and its picture appears in the list.`);
};
