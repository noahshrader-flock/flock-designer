import { type BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import {
	CHANNELS,
	type Checkout,
	type CheckoutSuggestion,
	type Iteration,
	type IterationKind,
	type MarkerRequest,
	PAGE_HOLD_REASONS,
	type PageBounds,
	type PageHoldReason,
	type Project,
	type PublishOutcome,
	type Result,
	type ReviewComment,
	type SavedIteration,
} from '../shared/contract';
import { AgentRunner } from './services/agent';
import { type ShareRunner, previewIsUp, pullRequestText } from './services/share';
import { realShareTools } from './services/shareTools';
import { buildContextReceipt } from './services/contextReceipt';
import { readDescriptor } from './services/descriptor';
import { branchCommit, isRepository, readCheckout } from './services/git';
import { assertUsableProjectId, continueIteration, createIteration, readIterations, recordPreview, recordedIteration } from './services/iterations';
import { findProductCheckouts, recordsRootFor } from './services/discovery';
import { classify, readBranchProjects } from './services/branchProjects';
import { RuntimeManager } from './services/runtime';
import { prepareAddress, readSkill } from './services/address';
import { projectTitle, writeCommentsExport } from './services/commentsExport';
import { DesignRepo } from './services/designRepo';
import type { PageView } from './services/pageView';
import { assertPreviewUrl, sanitizeAnchor, sanitizePicture } from '../shared/anchor';
import type { GitHubSession } from './services/githubSession';
import { OpenedCheckouts } from './services/session';
import { readFolderProjects } from './services/localProjects';
import { mergeProjects, unionLocal } from '../shared/projects';
import type { CheckoutMemory } from './services/checkoutMemory';

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
	share: ShareRunner;
	github: GitHubSession;
	designRepo: DesignRepo;
	page: PageView;
	memory: CheckoutMemory;
}

export const registerIpc = ({ window, opened, runtime, agent, share, github, designRepo, page, memory }: IpcContext): void => {
	const openRepository = async (root: string): Promise<Checkout> => {
		if (!isRepository(root)) {
			throw new Error(`${root} is not a git repository.`);
		}
		const canonical = opened.remember(root);
		memory.write(canonical);
		return readCheckout(canonical);
	};

	const descriptorFor = (root: string) => readDescriptor(opened.require(root));

	/**
	 * The product checkout this person has already accepted, or null.
	 *
	 * **Discovery deliberately does not feed this.** A repository's own
	 * `.flkd/workspace.json` is its command allowlist, so a repository that merely
	 * exists on disk must never become runnable: finding one is a suggestion, and
	 * accepting it (`useCheckout`, which a click calls) is what trusts it. Only a
	 * root that went through `openRepository` is remembered here, so the memory file
	 * can restore a choice that was made, never manufacture one.
	 */
	const trustedRoot = (): string | null => {
		const saved = memory.read();
		return saved !== null && isRepository(saved) && existsSync(join(saved, '.flkd', 'workspace.json')) ? saved : null;
	};

	/** Where this checkout's design records go; an error that says what to do when the design repository is not beside it. */
	const recordsFor = (productRoot: string): string => {
		const found = recordsRootFor(productRoot);
		if (found === null) {
			throw new Error(
				`Flock Designer could not find the design repository next to ${basename(productRoot)}. Clone flock-designer into the same folder, beside it.`,
			);
		}
		return found;
	};

	/**
	 * Shares an iteration's record with reviewers. Best effort by design: the
	 * designer's local work is already saved, so being signed out or lacking a
	 * permission is reported, never raised.
	 */
	const publish = async (projectId: string, recordsRoot: string): Promise<PublishOutcome> => {
		if (github.state().state !== 'signedIn') {
			return { state: 'skipped', reason: 'Sign in to share this iteration with reviewers.' };
		}
		try {
			await designRepo.publishIterations(projectId, readIterations(recordsRoot, projectId));
			return { state: 'published' };
		} catch (err) {
			return { state: 'skipped', reason: err instanceof Error ? err.message : String(err) };
		}
	};
	const saved = async (it: Iteration, recordsRoot: string): Promise<SavedIteration> => ({
		...it,
		published: await publish(it.projectId, recordsRoot),
	});

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

	ipcMain.handle(
		CHANNELS.lastCheckout,
		guard(async (): Promise<Checkout | null> => {
			const root = trustedRoot();
			return root === null ? null : openRepository(root);
		}),
	);

	// Finding a repository grants it nothing: this only describes one, and
	// `useCheckout` is the step that trusts it.
	ipcMain.handle(
		CHANNELS.suggestCheckout,
		guard((): CheckoutSuggestion | null => {
			if (trustedRoot() !== null) return null;
			const root = findProductCheckouts()[0];
			if (root === undefined) return null;
			try {
				return { root, name: basename(root), product: readDescriptor(root).product };
			} catch {
				// A descriptor we cannot read is not a repository we should offer.
				return null;
			}
		}),
	);

	ipcMain.handle(
		CHANNELS.useCheckout,
		guard(async (root: string): Promise<Checkout> => {
			// Only ever a repository discovery itself found, so the renderer cannot
			// name an arbitrary directory and have it trusted.
			if (!findProductCheckouts().includes(root)) {
				throw new Error('That is not a repository Flock Designer found on this machine.');
			}
			return openRepository(root);
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
			readIterations(recordsFor(opened.require(root)), projectId),
		),
	);

	ipcMain.handle(
		CHANNELS.createIteration,
		guard(async (root: string, projectId: string, note: string, kind: IterationKind) => {
			const canonical = opened.require(root);
			const descriptor = descriptorFor(root);
			const { branch } = await readCheckout(canonical);
			if (branch === null) {
				throw new Error('This repository has a detached HEAD. Check out a branch first.');
			}
			const recordsRoot = recordsFor(canonical);
			return saved(await createIteration(canonical, recordsRoot, descriptor, projectId, note, branch, kind), recordsRoot);
		}),
	);

	ipcMain.handle(
		CHANNELS.continueIteration,
		guard(async (root: string, projectId: string, name: string) => {
			const canonical = opened.require(root);
			const recordsRoot = recordsFor(canonical);
			const me = github.state();
			const login = me.state === 'signedIn' ? me.user.login : null;
			return saved(await continueIteration(canonical, recordsRoot, projectId, name, login, descriptorFor(root)), recordsRoot);
		}),
	);

	ipcMain.handle(
		CHANNELS.startCommand,
		guard((root: string, commandId: string, projectId?: string) =>
			runtime.start(opened.require(root), descriptorFor(root), commandId, projectId),
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
		guard((root: string, projectId: string, task: string) => {
			// Same rule startCommand applies. This one is interpolated into the agent's
			// prompt, and the agent runs unattended with edit permission, so an
			// unchecked value here is prompt injection rather than argv injection.
			assertUsableProjectId(projectId);
			return agent.start(opened.require(root), projectId, task, {
				// The project's records live in the design repository, beside the product checkout.
				addDirs: [recordsFor(opened.require(root))],
			});
		}),
	);

	ipcMain.handle(CHANNELS.agentStatus, guard(() => agent.status()));

	// One click: read the comments now, write the file from that read, then start the agent. Nothing
	// a reviewer wrote is put in the task; it reaches the agent only through the file.
	ipcMain.handle(
		CHANNELS.addressComments,
		guard(async (root: string, projectId: string, name: string) => {
			assertUsableProjectId(projectId);
			const canonical = opened.require(root);
			const recordsRoot = recordsFor(canonical);
			const iteration = await recordedIteration(canonical, recordsRoot, descriptorFor(root), projectId, name);
			const prepared = await prepareAddress(
				{
					readComments: () => designRepo.readComments(projectId, iteration.branch),
					checkout: () => readCheckout(canonical),
					agentRunning: () => agent.status().state === 'running',
					skill: () => readSkill(recordsRoot),
					title: projectTitle(recordsRoot, projectId),
				},
				{ recordsRoot, projectId, iteration },
			);
			return agent.start(canonical, projectId, prepared.task, { addDirs: [recordsRoot] });
		}),
	);

	// Sharing. The branch comes from this person's own record, never from the window, and
	// the repository's descriptor says what a share is. Starts and returns: it takes minutes.
	ipcMain.handle(
		CHANNELS.shareIteration,
		guard(async (root: string, projectId: string, name: string) => {
			assertUsableProjectId(projectId);
			const canonical = opened.require(root);
			const descriptor = descriptorFor(root);
			const { share: how } = descriptor;
			if (!how) {
				throw new Error(`${descriptor.product} does not say how a shared preview is built, so it cannot be shared from here.`);
			}
			const recordsRoot = recordsFor(canonical);
			const iteration = await recordedIteration(canonical, recordsRoot, descriptor, projectId, name);
			// Only what is committed goes up. Sharing a branch with unsaved edits would show reviewers less than the designer sees.
			const here = await readCheckout(canonical);
			if (here.branch === iteration.branch && !here.clean) {
				throw new Error(`There are uncommitted changes on ${iteration.branch}, and only committed work is shared. Commit them, then share again.`);
			}
			// The commit that goes up now, which is what reviewers will be looking at.
			const shared = await branchCommit(canonical, iteration.branch).catch(() => undefined);
			return share.start({
				request: {
					share: how,
					kind: name === 'codebase' ? 'codebase' : 'prototype',
					projectId,
					name,
					branch: iteration.branch,
					...pullRequestText(projectId, name),
				},
				tools: realShareTools(canonical),
				record: async (url) => {
					recordPreview(recordsRoot, projectId, name, url, shared);
					return publish(projectId, recordsRoot);
				},
			});
		}),
	);
	ipcMain.handle(CHANNELS.shareStatus, guard(() => share.status()));
	ipcMain.handle(
		CHANNELS.previewReachable,
		guard(async (url: string): Promise<boolean> => {
			const checked = assertPreviewUrl(String(url));
			try {
				const res = await fetch(checked, { redirect: 'follow', signal: AbortSignal.timeout(6000) });
				await res.body?.cancel();
				return previewIsUp(res.status);
			} catch {
				return false;
			}
		}),
	);

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
	// Everything on GitHub plus everything built on this machine. Work made here
	// must appear here, shared or not, so the two are merged; if GitHub cannot be
	// reached, what is local still shows.
	ipcMain.handle(
		CHANNELS.listProjects,
		guard(async (): Promise<Project[]> => {
			// The gate, not the discovery list: nothing is read or run in a repository
			// this person has not accepted.
			const root = trustedRoot();
			const me = github.state();
			const login = me.state === 'signedIn' ? me.user.login : null;
			let local: Project[] = [];
			if (root !== null) {
				opened.require(root);
				const recordsRoot = recordsRootFor(root);
				// Every project folder, not only those that record an iteration: the folder is what an agent makes
				// first, and it is what vouches for a `feature/<id>` branch (see readBranchProjects).
				const folders = recordsRoot ? readFolderProjects(recordsRoot) : [];
				// The branches are the evidence: work made without the app still shows.
				const branches = await readBranchProjects(
					root,
					readDescriptor(root),
					login,
					new Set(folders.map((p) => p.id)),
				).catch(() => []);
				// A folder with nothing built yet is a notes folder, not work in progress.
				local = unionLocal(folders, branches).filter((p) => p.iterations.length > 0);
			}
			let remote: Project[] = [];
			try {
				remote = await designRepo.listProjects();
			} catch (err) {
				if (local.length === 0) throw err;
			}
			return mergeProjects(remote, local);
		}),
	);
	/**
	 * Rewrites `comments.md` for what was just read, on a machine that has the design repository
	 * beside the product checkout. Best effort: reading comments never fails because a file
	 * could not be written; the Address button, which depends on the file, is strict.
	 */
	const exportComments = (projectId: string, branch: string, comments: ReviewComment[]): void => {
		try {
			const root = trustedRoot();
			const recordsRoot = root === null ? null : recordsRootFor(root);
			if (recordsRoot === null) return;
			// The record's name for it, or the one the branch's own name gives it (work with no record yet).
			const name =
				readIterations(recordsRoot, projectId).find((i) => i.branch === branch)?.name ??
				classify(readDescriptor(root as string), branch)?.name;
			if (!name) return;
			writeCommentsExport(recordsRoot, {
				projectId,
				title: projectTitle(recordsRoot, projectId),
				iteration: { name, branch },
				comments,
				generatedAt: new Date(),
			});
		} catch {
			// Nothing to do: the comments themselves were read fine.
		}
	};
	ipcMain.handle(
		CHANNELS.readComments,
		guard(async (projectId: string, branch: string): Promise<ReviewComment[]> => {
			const comments = await designRepo.readComments(projectId, branch);
			exportComments(projectId, branch, comments);
			return comments;
		}),
	);
	ipcMain.handle(
		CHANNELS.postComment,
		guard(
			(projectId: string, branch: string, body: string, anchor: unknown, picture?: unknown): Promise<ReviewComment> =>
				designRepo.postComment(projectId, branch, body, sanitizeAnchor(anchor), sanitizePicture(picture)),
		),
	);

	// The preview. Every argument is re-checked here: the window is trusted less
	// than the main process, and the preview less than the window.
	const nothing = (_done?: unknown): null => null;
	ipcMain.handle(CHANNELS.pageOpen, guard(async (url: string) => nothing(await page.open(String(url)))));
	ipcMain.handle(CHANNELS.pageClose, guard(() => nothing(page.close())));
	// The page the preview is on, in the person's own browser. The address comes from the preview itself, never
	// from the window, and goes through the same check as opening one: this app's own web addresses only.
	ipcMain.handle(
		CHANNELS.openPreviewInBrowser,
		guard(async () => {
			const url = page.currentUrl();
			if (url === null) throw new Error('There is no preview open to show in a browser.');
			await shell.openExternal(assertPreviewUrl(url));
			return null;
		}),
	);
	ipcMain.handle(
		CHANNELS.pageSetBounds,
		guard((b: PageBounds) => nothing(page.setBounds({ x: Number(b?.x), y: Number(b?.y), width: Number(b?.width), height: Number(b?.height) }))),
	);
	ipcMain.handle(CHANNELS.pageSnapshot, guard(() => page.snapshot()));
	ipcMain.handle(
		CHANNELS.pageHold,
		guard((reason: string, held: boolean) => {
			if (!(PAGE_HOLD_REASONS as readonly string[]).includes(reason)) throw new Error('That is not a reason to hide the preview.');
			return nothing(page.hold(reason as PageHoldReason, held === true));
		}),
	);
	ipcMain.handle(CHANNELS.pagePick, guard(() => page.pick()));
	ipcMain.handle(CHANNELS.pageCancelPick, guard(async () => nothing(await page.cancelPick())));
	ipcMain.handle(
		CHANNELS.pageShowMarkers,
		guard((items: MarkerRequest[]) => {
			const clean = (Array.isArray(items) ? items : []).slice(0, 200).flatMap((i): MarkerRequest[] => {
				const anchor = sanitizeAnchor(i?.anchor);
				return anchor && Number.isInteger(i.id) && Number.isInteger(i.number)
					? [{ id: i.id, number: i.number, anchor, movable: i.movable === true }]
					: [];
			});
			return page.showMarkers(clean);
		}),
	);
	ipcMain.handle(
		CHANNELS.moveComment,
		guard((commentId: number, anchor: unknown): Promise<ReviewComment> => {
			const clean = sanitizeAnchor(anchor);
			if (!clean || !Number.isInteger(commentId)) throw new Error('That is not a place a pin can be moved to.');
			return designRepo.moveComment(commentId, clean);
		}),
	);
	ipcMain.handle(
		CHANNELS.deleteComment,
		guard(async (commentId: number) => {
			if (!Number.isInteger(commentId)) throw new Error('That is not a comment.');
			await designRepo.deleteComment(commentId);
			return null;
		}),
	);
	ipcMain.handle(
		CHANNELS.resolveComment,
		guard((commentId: number, resolved: boolean): Promise<ReviewComment> => {
			if (!Number.isInteger(commentId)) throw new Error('That is not a comment.');
			return designRepo.setResolved(commentId, resolved === true);
		}),
	);
	// What the branch is at right now: read when a comment is placed, so the comment says
	// which version of the code it was made against rather than which one was last recorded.
	ipcMain.handle(
		CHANNELS.iterationCommit,
		guard(async (root: string, projectId: string, name: string): Promise<string | null> => {
			assertUsableProjectId(projectId);
			const canonical = opened.require(root);
			const found = await recordedIteration(canonical, recordsFor(canonical), descriptorFor(root), projectId, name).catch(() => null);
			return found ? branchCommit(canonical, found.branch).catch(() => null) : null;
		}),
	);
	ipcMain.handle(CHANNELS.pageFocusMarker, guard(async (id: number) => nothing(await page.focusMarker(Number(id)))));
};
