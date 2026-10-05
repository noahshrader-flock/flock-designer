import { type BrowserWindow, dialog, ipcMain } from 'electron';
import { CHANNELS, type Checkout, type Project, type Result, type ReviewComment } from '../shared/contract';
import { AgentRunner } from './services/agent';
import { buildContextReceipt } from './services/contextReceipt';
import { readDescriptor } from './services/descriptor';
import { isRepository, readCheckout } from './services/git';
import { continueIteration, createIteration, defaultRecordsRoot, readIterations } from './services/iterations';
import { RuntimeManager } from './services/runtime';
import { DesignRepo } from './services/designRepo';
import type { GitHubSession } from './services/githubSession';
import { OpenedCheckouts } from './services/session';

/**
 * Every operation the window can reach, and nothing else.
 *
 * There is no generic invoke and no passthrough. Each handler is named, takes
 * typed arguments, resolves the root against what the designer actually opened,
 * and returns a Result rather than throwing across the boundary -- an exception
 * crossing IPC arrives as a shapeless string, which is how a real problem turns
 * into "something went wrong".
 */

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = (error: unknown): Result<never> => ({
	ok: false,
	error: error instanceof Error ? error.message : String(error),
});

const guard =
	<Args extends unknown[], T>(fn: (...args: Args) => Promise<T> | T) =>
	async (_event: Electron.IpcMainInvokeEvent, ...args: Args): Promise<Result<T>> => {
		try {
			return ok(await fn(...args));
		} catch (err) {
			return fail(err);
		}
	};

export interface IpcContext {
	window: BrowserWindow;
	opened: OpenedCheckouts;
	runtime: RuntimeManager;
	agent: AgentRunner;
	github: GitHubSession;
	designRepo: DesignRepo;
}

export const registerIpc = ({ window, opened, runtime, agent, github, designRepo }: IpcContext): void => {
	const openRepository = async (root: string): Promise<Checkout> => {
		if (!isRepository(root)) {
			throw new Error(`${root} is not a git repository.`);
		}
		const canonical = opened.remember(root);
		return readCheckout(canonical);
	};

	const descriptorFor = (root: string) => readDescriptor(opened.require(root));

	ipcMain.handle(
		CHANNELS.chooseCheckout,
		guard(async (): Promise<Checkout | null> => {
			const { canceled, filePaths } = await dialog.showOpenDialog(window, {
				title: 'Open a product repository',
				properties: ['openDirectory'],
			});
			const chosen = filePaths[0];
			if (canceled || chosen === undefined) {
				return null;
			}
			return openRepository(chosen);
		}),
	);

	ipcMain.handle(CHANNELS.openCheckout, guard((root: string) => openRepository(root)));

	ipcMain.handle(
		CHANNELS.readContextReceipt,
		guard((root: string) => buildContextReceipt(opened.require(root), descriptorFor(root))),
	);

	ipcMain.handle(
		CHANNELS.listIterations,
		guard((root: string, projectId: string) =>
			readIterations(defaultRecordsRoot(opened.require(root)), projectId),
		),
	);

	ipcMain.handle(
		CHANNELS.createIteration,
		guard(async (root: string, projectId: string, note: string) => {
			const canonical = opened.require(root);
			const descriptor = descriptorFor(root);
			const { branch } = await readCheckout(canonical);
			if (branch === null) {
				throw new Error('This repository has a detached HEAD. Check out a branch first.');
			}
			return createIteration(canonical, defaultRecordsRoot(canonical), descriptor, projectId, note, branch);
		}),
	);

	ipcMain.handle(
		CHANNELS.continueIteration,
		guard((root: string, projectId: string, name: string) => {
			const canonical = opened.require(root);
			return continueIteration(canonical, defaultRecordsRoot(canonical), projectId, name);
		}),
	);

	ipcMain.handle(
		CHANNELS.startCommand,
		guard((root: string, commandId: string) =>
			runtime.start(opened.require(root), descriptorFor(root), commandId),
		),
	);

	ipcMain.handle(
		CHANNELS.stopCommand,
		guard((root: string, commandId: string) => {
			opened.require(root);
			return runtime.stop(commandId);
		}),
	);

	ipcMain.handle(
		CHANNELS.commandStatus,
		guard((root: string, commandId: string) => {
			opened.require(root);
			return runtime.status(commandId);
		}),
	);

	ipcMain.handle(
		CHANNELS.startAgent,
		guard((root: string, projectId: string, task: string) =>
			agent.start(opened.require(root), projectId, task),
		),
	);

	ipcMain.handle(CHANNELS.agentStatus, guard(() => agent.status()));

	// Sign-in. No handler returns a token: the renderer only ever learns whether
	// someone is signed in, and who.
	ipcMain.handle(CHANNELS.signInStart, guard(() => github.startSignIn()));
	ipcMain.handle(
		CHANNELS.signInCancel,
		guard(() => {
			github.cancelSignIn();
			return null;
		}),
	);
	ipcMain.handle(CHANNELS.signInState, guard(() => github.state()));
	ipcMain.handle(
		CHANNELS.signOut,
		guard(() => {
			github.signOut();
			return null;
		}),
	);

	// Reviewer mode: read through the API, never a checkout.
	ipcMain.handle(CHANNELS.listProjects, guard((): Promise<Project[]> => designRepo.listProjects()));
	ipcMain.handle(
		CHANNELS.readComments,
		guard((projectId: string, branch: string): Promise<ReviewComment[]> => designRepo.readComments(projectId, branch)),
	);
	ipcMain.handle(
		CHANNELS.postComment,
		guard(
			(projectId: string, branch: string, body: string): Promise<ReviewComment> =>
				designRepo.postComment(projectId, branch, body),
		),
	);
};
