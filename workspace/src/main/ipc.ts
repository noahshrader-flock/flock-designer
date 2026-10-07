import { type BrowserWindow, clipboard, dialog, ipcMain, shell } from 'electron';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
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
	type MoveToCodePlan,
	type Person,
	type QuickReadiness,
	type Project,
	type Repository,
	type PublishStatus,
	type Result,
	type ReviewComment,
} from '../shared/contract';
import { AgentRunner, agentReadiness, locateClaude } from './services/agent';
import { SessionMemory, findEditor, openFolder, openSession, resumeCommand } from './services/handoff';
import { type ShareRunner, previewIsUp, pullRequestText } from './services/share';
import { realShareTools } from './services/shareTools';
import { buildContextReceipt } from './services/contextReceipt';
import { readDescriptor } from './services/descriptor';
import { branchCommit, branchExists, isRepository, readCheckout, readTreeAt, recentBranches, runGit } from './services/git';
import { assertUsableProjectId, codebaseBranchFor, continueIteration, createIteration, readIterations, recordPreview, recordedIteration } from './services/iterations';
import { findProductCheckouts, recordsRootFor } from './services/discovery';
import { gitHubRepoOf, mergeRepositories, originOf, visibleRepositories } from './services/repositories';
import { classify, readBranchProjects } from './services/branchProjects';
import { RuntimeManager } from './services/runtime';
import { prepareAddress, readSkill } from './services/address';
import { projectTitle, writeCommentsExport } from './services/commentsExport';
import { syncRecords } from './services/designSync';
import { syncBranches } from './services/branchSync';
import { PublishManager, publishInOrder } from './services/publisher';
import { DesignRepo } from './services/designRepo';
import type { PageView } from './services/pageView';
import { assertPreviewUrl, sanitizeAnchor, sanitizePicture } from '../shared/anchor';
import type { GitHubSession } from './services/githubSession';
import { OpenedCheckouts } from './services/session';
import { readFolderProjects } from './services/localProjects';
import { isRecordName, mergeProjects, quickKey, quickPagePath, quickSourcePath, unionLocal } from '../shared/projects';
import { resolveInside } from './services/paths';
import { QuickServer } from './services/quickServer';
import { bundleCommand, esbuildEntry, runBundle, sharedFilesOf, writeBundleScript } from './services/quickBundle';
import {
	BUILD_SKILL,
	MAX_PAGE,
	MOVE_SKILL,
	type RecordStore,
	assertQuickName,
	cloneStore,
	moveToCodeTask,
	quickBuildTask,
	quickReadable,
	type QuickBuild,
	type QuickSources,
	recordQuick,
} from './services/quick';
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
	/** Told whenever publishing moves, so the window can show it. */
	onPublishStatus: (status: PublishStatus) => void;
	/** Where quick prototypes are built before they are saved: the app's own folder, never a repository. */
	quickRoot?: string;
	quickServer?: QuickServer;
	/** The latest agent conversation for each branch, so it can be continued in the person's editor. */
	sessions?: SessionMemory;
}

export const registerIpc = ({
	window,
	opened,
	runtime,
	agent,
	share,
	github,
	designRepo,
	page,
	memory,
	onPublishStatus,
	quickRoot = join(tmpdir(), 'flock-designer-quick'),
	quickServer = new QuickServer(),
	sessions = new SessionMemory(join(tmpdir(), 'flock-designer-agent-sessions.json')),
}: IpcContext): { publish: (force?: boolean) => Promise<void> } => {
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
	 * Keeps the person's work published: branches, then records. It runs by itself (when the list is read, when
	 * something is written, when the window is focused) and shows where it has got to, so nothing is left for
	 * anyone to remember. See `PublishManager`.
	 */
	const publisher = new PublishManager(
		{
			context: async () => {
				const root = trustedRoot();
				const recordsRoot = root === null ? null : recordsRootFor(root);
				if (root === null || recordsRoot === null) return null;
				opened.require(root);
				const descriptor = readDescriptor(root);
				return {
					run: () =>
						publishInOrder(
							() => syncBranches({ root, descriptor, projects: new Set(readFolderProjects(recordsRoot).map((p) => p.id)) }),
							async (found) => {
								// Reviewers find an iteration through its record, so work built in a terminal (a branch, a folder,
								// and no record) is recorded here, then published with the rest.
								for (const branch of found.mine) {
									const work = classify(descriptor, branch);
									if (work) await recordedIteration(root, recordsRoot, descriptor, work.projectId, work.name).catch(() => undefined);
								}
								return syncRecords(dirname(recordsRoot));
							},
						),
				};
			},
		},
		onPublishStatus,
	);
	// A record just written is published without anyone asking, and without holding up what they were doing.
	const written = <T>(value: T): T => {
		void publisher.publish(true);
		return value;
	};

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

	ipcMain.handle(
		CHANNELS.listRepositories,
		guard(async (): Promise<Repository[]> => {
			const clones = findProductCheckouts().map((root) => {
				const origin = originOf(root);
				return { root, repo: origin === null ? null : gitHubRepoOf(origin) };
			});
			// Signed out, or GitHub out of reach: what is on this machine can still be started in.
			const remote = github.state().state === 'signedIn' ? await visibleRepositories(github).catch(() => []) : [];
			return mergeRepositories(remote, clones);
		}),
	);

	ipcMain.handle(
		CHANNELS.listBaseBranches,
		guard((root: string) => recentBranches(opened.require(root))),
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

	/** Switching branches under a running agent changes the files it is working on mid-run. */
	const assertAgentNotHere = (canonical: string): void => {
		if (agent.runningIn(canonical)) {
			throw new Error(`The agent is working in ${basename(canonical)} on another branch. Wait for it to finish, or take it over, then open this again.`);
		}
	};

	ipcMain.handle(
		CHANNELS.createIteration,
		guard(async (root: string, projectId: string, note: string, kind: IterationKind, from?: string) => {
			// A quick prototype has no branch; it is made by createQuick, never here.
			if (kind !== 'prototype' && kind !== 'codebase') throw new Error('That kind of work is not made on a branch.');
			const canonical = opened.require(root);
			assertAgentNotHere(canonical);
			const descriptor = descriptorFor(root);
			// Only ever a branch that exists here, so the window cannot pass git an option or a revision expression.
			if (from !== undefined && !(await branchExists(canonical, from))) {
				throw new Error(`There is no branch called ${from} in ${basename(canonical)}.`);
			}
			const branch = from ?? (await readCheckout(canonical)).branch;
			if (branch === null) {
				throw new Error('This repository has a detached HEAD. Check out a branch first.');
			}
			// Work is built where the product's Flock Designer setup is. A branch without it (develop, before the
			// setup is merged there) would leave the checkout on a branch this app can no longer work in.
			const setup = `${descriptor.contextDir}/workspace.json`;
			if (!(await runGit(canonical, ['cat-file', '-e', `refs/heads/${branch}:${setup}`]).then(() => true, () => false))) {
				throw new Error(`${branch} has no ${setup}, so work cannot start from it. Start from a branch that has the Flock Designer setup.`);
			}
			const recordsRoot = recordsFor(canonical);
			return written(await createIteration(canonical, recordsRoot, descriptor, projectId, note, branch, kind));
		}),
	);

	ipcMain.handle(
		CHANNELS.continueIteration,
		guard(async (root: string, projectId: string, name: string) => {
			const canonical = opened.require(root);
			// Opening the run's own work is fine: the checkout is already on its branch, so nothing moves.
			if (agent.runningIn(canonical)) {
				const wanted = await recordedIteration(canonical, recordsFor(canonical), descriptorFor(root), projectId, name);
				if ((await readCheckout(canonical)).branch !== wanted.branch) assertAgentNotHere(canonical);
			}
			const recordsRoot = recordsFor(canonical);
			const me = github.state();
			const login = me.state === 'signedIn' ? me.user.login : null;
			return written(await continueIteration(canonical, recordsRoot, projectId, name, login, descriptorFor(root)));
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

	/**
	 * What a codebase run may read besides the checkout: the shared skills and standards the product's guidance
	 * points at, and the design system's own guidance beside it. Read only, and named in the task, since a folder
	 * the agent has not been told about is one it never opens.
	 */
	const sharedGuidance = (canonical: string): { dirs: string[]; note: string } => {
		const designRoot = recordsRootFor(canonical);
		const pkg = readDescriptor(canonical).designSystem.package;
		const named: Array<[string, string | null]> = [
			['Shared skills (a `skills/…` path in any guidance is here)', designRoot === null ? null : join(dirname(designRoot), 'skills')],
			['Shared standards', designRoot === null ? null : join(dirname(designRoot), 'standards')],
			["The design system's checkout (its guidance and source)", join(dirname(canonical), basename(pkg))],
		];
		const found = named.filter((n): n is [string, string] => n[1] !== null && existsSync(n[1]));
		if (!found.length) return { dirs: [], note: '' };
		return {
			dirs: found.map(([, d]) => d),
			note: ['', '', '## Also yours to read (never change)', '', ...found.map(([what, d]) => `- ${what}: \`${d}\``)].join('\n'),
		};
	};

	ipcMain.handle(
		CHANNELS.startAgent,
		guard(async (root: string, projectId: string, task: string) => {
			// Same rule startCommand applies. This one is interpolated into the agent's
			// prompt, and the agent runs unattended with edit permission, so an
			// unchecked value here is prompt injection rather than argv injection.
			assertUsableProjectId(projectId);
			const canonical = opened.require(root);
			// The run is tagged with the branch it works on, so a screen opened again finds its own run.
			const branch = (await readCheckout(canonical)).branch;
			const now = agent.status();
			if (now.state === 'running') {
				// The same work asked twice (the screen opened twice) joins its run; anything else must not be
				// mistaken for it, or the screen would wait on someone else's run and report this work as done.
				if (branch !== null && now.work === branch) return now;
				throw new Error('The agent is already working on something else. Wait for it to finish, then try again.');
			}
			// A quick prototype being moved into the code is read from the app's own copy of it.
			const quick = join(quickRoot, projectId);
			const session = randomUUID();
			const shared = sharedGuidance(canonical);
			const started = agent.start(canonical, projectId, `${task}${shared.note}`, {
				// The project's records live in the design repository, beside the product checkout.
				addDirs: [recordsFor(canonical), ...(existsSync(quick) ? [quick] : [])],
				readOnly: shared.dirs,
				...(branch !== null ? { work: branch } : {}),
				session,
				name: `Flock Designer: ${projectId}`,
			});
			if (started.state === 'running' && branch !== null) sessions.write(canonical, branch, session);
			return started;
		}),
	);

	// Handing the work to the person, in VS Code. Only ever on a click: it opens another application.
	ipcMain.handle(
		CHANNELS.handoffState,
		guard((root: string, branch: string) => ({
			editor: findEditor() !== null,
			session: sessions.read(opened.require(root), String(branch)) !== null,
		})),
	);
	ipcMain.handle(
		CHANNELS.openInEditor,
		guard(async (root: string) => {
			const canonical = opened.require(root);
			const editor = findEditor();
			if (editor) await openFolder(editor, canonical);
			else await shell.openPath(canonical);
			return null;
		}),
	);
	ipcMain.handle(
		CHANNELS.continueInClaude,
		guard(async (root: string, branch: string) => {
			const canonical = opened.require(root);
			const found = sessions.read(canonical, String(branch));
			if (!found) throw new Error('There is no agent conversation for this work on this machine.');
			// Taking over a run still going: one conversation has one writer, so the app's run stops first.
			if (agent.runningSession() === found.session) agent.stop();
			const editor = findEditor();
			if (editor) {
				await openSession(editor, found);
				return null;
			}
			clipboard.writeText(resumeCommand(locateClaude(), found));
			await dialog.showMessageBox({
				type: 'info',
				message: 'The command to continue is copied',
				detail: 'VS Code with the Claude Code extension is not installed here. Paste the command into a terminal to continue the same conversation.',
			});
			return null;
		}),
	);

	ipcMain.handle(CHANNELS.agentStatus, guard(() => agent.status()));
	ipcMain.handle(CHANNELS.agentRecent, guard(() => agent.recentLines()));
	ipcMain.handle(CHANNELS.agentReadiness, guard(() => agentReadiness()));

	// One click: read the comments now, write the file from that read, then start the agent. Nothing
	// a reviewer wrote is put in the task; it reaches the agent only through the file.
	ipcMain.handle(
		CHANNELS.addressComments,
		guard(async (root: string, projectId: string, name: string, commentId: number) => {
			assertUsableProjectId(projectId);
			// The window supplies this, so it is checked like anything else that crosses the boundary.
			// There is no batch: a request with no comment is a mistake, not a request for all of them.
			if (!Number.isSafeInteger(commentId)) throw new Error('That is not a comment.');
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
				{ recordsRoot, projectId, iteration, commentId },
			);
			const session = randomUUID();
			const shared = sharedGuidance(canonical);
			const started = agent.start(canonical, projectId, `${prepared.task}${shared.note}`, {
				addDirs: [recordsRoot],
				readOnly: shared.dirs,
				session,
				name: `Flock Designer: ${projectId}`,
			});
			if (started.state === 'running') sessions.write(canonical, iteration.branch, session);
			return started;
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
				// Saved, then published, and only then is the link called ready: a reviewer cannot open what is not up yet.
				record: async (url) => {
					recordPreview(recordsRoot, projectId, name, url, shared);
					await publisher.publish(true);
				},
			});
		}),
	);
	ipcMain.handle(CHANNELS.shareStatus, guard(() => share.status()));

	// Publishing happens by itself; these only report it, and let a person ask for it now.
	ipcMain.handle(CHANNELS.publishStatus, guard(() => publisher.status()));
	ipcMain.handle(
		CHANNELS.publishNow,
		guard(async () => {
			await publisher.publish(true);
			return publisher.status();
		}),
	);
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
			// Reading the list is a good moment to make sure what it shows is published.
			void publisher.publish();
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
	/*
	 * Quick prototypes. Everything they write goes to one place per machine: the design repository's
	 * clone when there is one here, so the publisher sends it like every other record, and otherwise
	 * GitHub directly.
	 */
	const recordStore = (): RecordStore => {
		const root = trustedRoot();
		const recordsRoot = root === null ? null : recordsRootFor(root);
		return recordsRoot !== null
			? cloneStore(dirname(recordsRoot), () => void publisher.publish(true))
			: {
					read: (path) => designRepo.readFile(path),
					has: (path) => designRepo.hasFile(path),
					write: (path, content, message) => designRepo.writeFile(path, content, message),
				};
	};
	/** The folder an agent builds a project's quick prototypes in, and the page file inside it. */
	const quickDir = (projectId: string): string => {
		assertUsableProjectId(projectId);
		const dir = join(quickRoot, projectId);
		mkdirSync(dir, { recursive: true });
		return dir;
	};
	const quickFile = (projectId: string, name: string): string => {
		assertQuickName(name);
		return join(quickDir(projectId), `${name}.html`);
	};
	const quickSourceFile = (projectId: string, name: string): string => join(dirname(quickFile(projectId, name)), `${name}.tsx`);
	/**
	 * Whether a quick prototype can be built from this accepted repository here: its design system installed, and the
	 * bundler present. The page is always React with the real components, so without them there is nothing to build,
	 * and the person is told what to install before anything is made, never handed a lesser page.
	 */
	const quickReadiness = (root: string): QuickReadiness => {
		const canonical = opened.require(root);
		const designSystem = readDescriptor(canonical).designSystem.package;
		const pkg = join(canonical, 'node_modules', ...designSystem.split('/'));
		if (!existsSync(join(pkg, 'package.json'))) return { ready: false, why: 'not-installed', designSystem, repository: basename(canonical) };
		if (esbuildEntry() === null) return { ready: false, why: 'no-bundler', designSystem, repository: basename(canonical) };
		let version: string | null = null;
		try {
			version = (JSON.parse(readFileSync(join(pkg, 'package.json'), 'utf8')) as { version?: string }).version ?? null;
		} catch {
			// A package.json that cannot be read still means it is installed.
		}
		return { ready: true, designSystem, version };
	};
	const quickBuildPlan = (projectId: string, name: string, sources: QuickSources | null): QuickBuild => {
		const root = trustedRoot();
		const ready = root === null ? null : quickReadiness(root);
		if (!sources?.nodeModules || ready === null || !ready.ready) {
			throw new Error(
				ready !== null && !ready.ready && ready.why === 'not-installed'
					? `Quick prototypes are built from the real design system, and ${ready.designSystem} is not installed in ${ready.repository}. Run npm ci there (it needs access to the private packages), then try again.`
					: 'Quick prototypes are built from the real design system, so they need the product repository, with its packages installed, on this machine.',
			);
		}
		const source = quickSourceFile(projectId, name);
		const page = quickFile(projectId, name);
		return {
			source,
			page,
			buildCommand: bundleCommand(writeBundleScript(quickRoot), esbuildEntry() as string, source, page, sources.nodeModules, sharedDir),
		};
	};
	/**
	 * Builds a React prototype's page from its source, against the accepted checkout's installed packages.
	 * Throws with what the build said, so a page that does not compile says why rather than showing an old one.
	 */
	const buildQuickPage = async (projectId: string, name: string): Promise<void> => {
		const root = trustedRoot();
		const esbuild = esbuildEntry();
		if (root === null || esbuild === null) throw new Error('This prototype is written in React, and building it needs the product repository installed on this machine.');
		const r = await runBundle(
			writeBundleScript(quickRoot),
			esbuild,
			quickSourceFile(projectId, name),
			quickFile(projectId, name),
			join(opened.require(root), 'node_modules'),
			sharedDir,
		);
		if (!r.ok) throw new Error(`The prototype did not build:\n${r.output.slice(0, 2000)}`);
	};
	/**
	 * Large files pages share (the design system's fonts), each kept once by its content: here in the app's folder
	 * as builds make them, and in the design repository beside the projects, where `_` keeps them off the list.
	 */
	const sharedDir = join(quickRoot, '_shared');
	const sharedPath = (n: string): string => `projects/_shared/${n}.datauri`;
	/**
	 * Saves a page with what it needs: the shared files it points at that the design repository does not have yet
	 * (first, so a page is never there without them), its React source, then the page.
	 */
	const keepQuick = async (projectId: string, name: string, html: string): Promise<void> => {
		const store = recordStore();
		for (const n of sharedFilesOf(html)) {
			const local = join(sharedDir, `${n}.datauri`);
			if (existsSync(local) && !(await store.has(sharedPath(n)))) await store.write(sharedPath(n), readFileSync(local, 'utf8'), `Shared file ${n}`);
		}
		const source = quickSourceFile(projectId, name);
		if (existsSync(source)) await store.write(quickSourcePath(projectId, name), readFileSync(source, 'utf8'), `${projectId}: quick prototype ${name} source`);
		await store.write(quickPagePath(projectId, name), html, `${projectId}: quick prototype ${name}`);
	};
	/** Makes the shared files a page points at available beside it: this machine's copy, else the design repository's. */
	const serveShared = async (html: string): Promise<void> => {
		for (const n of sharedFilesOf(html)) {
			if (quickServer.hasShared(n)) continue;
			const local = join(sharedDir, `${n}.datauri`);
			const uri = existsSync(local) ? readFileSync(local, 'utf8') : ((await recordStore().read(sharedPath(n))) ?? (await designRepo.readFile(sharedPath(n))));
			if (uri !== null) quickServer.share(n, uri);
		}
	};
	/** The page: this machine's newest build first, then the saved one here, then GitHub's. */
	const quickPage = async (projectId: string, name: string): Promise<string | null> => {
		const local = quickFile(projectId, name);
		const source = quickSourceFile(projectId, name);
		// A source changed since its page was last built (or never built) is built first, unless its agent is still at it.
		const stale = existsSync(source) && (!existsSync(local) || statSync(source).mtimeMs > statSync(local).mtimeMs);
		if (stale && agent.status().state !== 'running') await buildQuickPage(projectId, name);
		if (existsSync(local)) return readFileSync(local, 'utf8');
		const path = quickPagePath(projectId, name);
		return (await recordStore().read(path)) ?? (await designRepo.readFile(path));
	};
	const readSkillFile = (designRoot: string, path: string): string | null => {
		const file = join(designRoot, path);
		return existsSync(file) ? readFileSync(file, 'utf8') : null;
	};
	/**
	 * The product code a quick prototype is modelled on, as a folder the agent may read: the clone itself
	 * when it is on that branch already, otherwise the app's own read-only copy of the branch, so the
	 * person's checkout is never switched. Null when there is nothing on this machine to read.
	 */
	const quickSource = async (projectId: string, name: string): Promise<QuickSources | null> => {
		const raw = await recordStore().read(`projects/${projectId}/iterations.json`);
		const basedOn = (JSON.parse(raw ?? '[]') as Iteration[]).find((i) => i.name === name)?.basedOn;
		const root = trustedRoot();
		// Only the repository this person accepted, and only the one the prototype was based on.
		if (!basedOn || root === null || basename(root) !== basedOn.repository) return null;
		const canonical = opened.require(root);
		let code = canonical;
		if ((await readCheckout(canonical)).branch !== basedOn.branch) {
			code = join(quickRoot, 'source', basename(canonical));
			await readTreeAt(canonical, code, basedOn.branch);
		}
		const dir = (p: string): string | null => (existsSync(p) ? p : null);
		const descriptor = readDescriptor(canonical);
		const pkg = descriptor.designSystem.package;
		const designRoot = recordsRootFor(canonical);
		const installedDesignSystem = dir(join(canonical, 'node_modules', ...pkg.split('/')));
		return {
			code,
			// The guidance that goes with the code when the branch has it; otherwise the accepted checkout's,
			// which always has it (develop has no Flock Designer files, and the page must still follow the product).
			productGuidance: dir(join(code, descriptor.contextDir)) ?? dir(join(canonical, descriptor.contextDir)),
			// The design system's checkout beside the product, named as its package is: its guidance and, as
			// important for a page that redraws its components, its source.
			designSystemGuidance: dir(join(dirname(canonical), basename(pkg))),
			installedDesignSystem,
			sharedStandards: designRoot === null ? null : dir(join(dirname(designRoot), 'standards')),
			// Only worth building against when the design system itself is installed in them.
			nodeModules: installedDesignSystem ? join(canonical, 'node_modules') : null,
		};
	};
	/** Runs `work` once at a time per key: a second caller waits for the first and shares its answer. */
	const inFlight = new Map<string, Promise<unknown>>();
	const once = <T>(key: string, work: () => Promise<T>): Promise<T> => {
		const running = inFlight.get(key) as Promise<T> | undefined;
		if (running) return running;
		const p = work().finally(() => inFlight.delete(key));
		inFlight.set(key, p);
		return p;
	};
	const me = (): Person | null => {
		const s = github.state();
		return s.state === 'signedIn' ? { name: s.user.name ?? s.user.login, login: s.user.login } : null;
	};

	ipcMain.handle(CHANNELS.quickReadiness, guard((root: string) => quickReadiness(root)));

	ipcMain.handle(
		CHANNELS.createQuick,
		guard(async (projectId: string, title: string, note: string, from: { root: string; branch: string } | null) => {
			assertUsableProjectId(projectId);
			// What it is modelled on is not optional: a quick prototype is built from a repository's real design system.
			if (!from) throw new Error('A quick prototype is modelled on a branch of a repository on this machine. Choose one.');
			if (!quickReadiness(from.root).ready) throw new Error('That repository has no design system installed here, so a quick prototype cannot be built from it. Run npm ci in it first.');
			if (typeof title !== 'string' || !title.trim()) throw new Error('A quick prototype needs a name.');
			// What it is modelled on: only a repository this person accepted, and a branch that exists in it.
			let basedOn: Iteration['basedOn'];
			if (from) {
				const canonical = opened.require(from.root);
				if (!(await branchExists(canonical, from.branch))) throw new Error(`There is no branch called ${from.branch} in ${basename(canonical)}.`);
				basedOn = { repository: basename(canonical), branch: from.branch, commit: await branchCommit(canonical, from.branch).catch(() => null) };
			}
			return recordQuick(recordStore(), { projectId, title: title.slice(0, 200), note: String(note).slice(0, 8000), me: me(), basedOn });
		}),
	);

	ipcMain.handle(
		CHANNELS.buildQuick,
		guard(async (projectId: string, name: string, request: string) => {
			assertQuickName(name);
			// The screen can ask twice (it is opened twice in development, and Try again asks again). One agent is
			// already building: this request waits on that run rather than starting a second or failing.
			if (agent.status().state === 'running') return agent.status();
			const store = recordStore();
			const skill = (await store.read(BUILD_SKILL)) ?? (await designRepo.readFile(BUILD_SKILL));
			if (skill === null) throw new Error(`The design repository has no ${BUILD_SKILL}, which tells the agent how to build a quick prototype.`);
			const sources = await once(`source:${projectId}`, () => quickSource(projectId, name));
			const build = quickBuildPlan(projectId, name, sources);
			return agent.start(quickDir(projectId), projectId, quickBuildTask({ skill, build, sources: sources as QuickSources, request: String(request) }), {
				bare: true,
				readOnly: quickReadable(sources),
				work: quickKey(projectId, name),
			});
		}),
	);

	ipcMain.handle(
		CHANNELS.saveQuick,
		guard(async (projectId: string, name: string): Promise<null> => {
			const pageFile = quickFile(projectId, name);
			const source = quickSourceFile(projectId, name);
			// Written in React: the page is built from the source now, so what is saved is what the source makes.
			if (existsSync(source)) await buildQuickPage(projectId, name);
			if (!existsSync(pageFile)) throw new Error('The agent finished without writing the page.');
			const html = readFileSync(pageFile, 'utf8');
			if (html.length > MAX_PAGE) {
				throw new Error(`This page is ${Math.round(html.length / 1_000_000)} MB, more than GitHub accepts for one file (100 MB), so it cannot be saved. It is still here and still opens on this machine. Large images or fonts embedded in the page are the usual cause.`);
			}
			await keepQuick(projectId, name, html);
			return null;
		}),
	);

	ipcMain.handle(
		CHANNELS.openQuick,
		guard(async (projectId: string, name: string): Promise<string> => {
			const html = await quickPage(projectId, name);
			if (html === null) throw new Error('This quick prototype has no page yet.');
			// A page built here but never saved (the screen was left, or gave up, while the agent finished) is saved
			// now: what this machine shows is what reviewers get, and no finished page is stranded on one machine.
			const local = quickFile(projectId, name);
			const path = quickPagePath(projectId, name);
			if (existsSync(local) && agent.status().state !== 'running' && (await recordStore().read(path)) !== html) await keepQuick(projectId, name, html);
			await serveShared(html);
			return quickServer.serve(`${projectId}/${name}`, html);
		}),
	);

	ipcMain.handle(
		CHANNELS.moveToCodePlan,
		guard(async (root: string, projectId: string, name: string): Promise<MoveToCodePlan> => {
			assertUsableProjectId(projectId);
			assertQuickName(name);
			const canonical = opened.require(root);
			const branch = codebaseBranchFor(descriptorFor(root), projectId);
			const raw = await recordStore().read(`projects/${projectId}/iterations.json`);
			const records = JSON.parse(raw ?? '[]') as Iteration[];
			const basedOn = records.find((i) => i.name === name)?.basedOn;
			const here = await readCheckout(canonical);
			return {
				branch,
				exists: await branchExists(canonical, branch),
				recorded: records.some((i) => i.name === 'codebase'),
				repository: basename(canonical),
				basedOn: basedOn ? { repository: basedOn.repository, branch: basedOn.branch } : null,
				current: here.branch,
				clean: here.clean,
			};
		}),
	);

	ipcMain.handle(
		CHANNELS.prepareMoveToCode,
		guard(async (projectId: string, name: string): Promise<string> => {
			const root = trustedRoot();
			if (root === null) throw new Error('Building in the codebase needs the product repository on this machine.');
			const recordsRoot = recordsFor(opened.require(root));
			const skill = readSkillFile(dirname(recordsRoot), MOVE_SKILL);
			if (skill === null) throw new Error(`The design repository on this machine has no ${MOVE_SKILL}. Update it (git pull) and try again.`);
			// The page is copied where the agent is allowed to read it, so it works from the version saved, wherever that is.
			const html = await quickPage(projectId, name);
			if (html === null) throw new Error('This quick prototype has no page yet.');
			const pageFile = quickFile(projectId, name);
			writeFileSync(pageFile, html);
			// Its React source too, when it has one: real components are a far better start than a page.
			const sourceFile = quickSourceFile(projectId, name);
			const source = existsSync(sourceFile) ? readFileSync(sourceFile, 'utf8') : await recordStore().read(quickSourcePath(projectId, name));
			if (source !== null) writeFileSync(sourceFile, source);
			const raw = await recordStore().read(`projects/${projectId}/iterations.json`);
			const basedOn = (JSON.parse(raw ?? '[]') as Iteration[]).find((i) => i.name === name)?.basedOn;
			return moveToCodeTask({
				skill,
				pageFile,
				sourceFile: source !== null ? sourceFile : null,
				auditFile: join(recordsRoot, projectId, `audit-${name}.md`),
				name,
				basedOn,
			});
		}),
	);

	/** A record is text a person reads; anything larger than this is not one, and is cut rather than sent whole. */
	const MAX_RECORD = 400_000;
	ipcMain.handle(
		CHANNELS.readRecord,
		guard(async (projectId: string, name: string): Promise<string> => {
			if (!isRecordName(projectId) || !isRecordName(name)) throw new Error('That is not a file in a project.');
			// This machine's copy first: it is the one being written, and may not be published yet.
			const root = trustedRoot();
			const recordsRoot = root === null ? null : recordsRootFor(root);
			if (recordsRoot !== null) {
				const path = resolveInside(recordsRoot, join(projectId, name));
				if (existsSync(path) && statSync(path).isFile()) return readFileSync(path, 'utf8').slice(0, MAX_RECORD);
			}
			return (await designRepo.readRecord(projectId, name)).slice(0, MAX_RECORD);
		}),
	);
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
	ipcMain.handle(
		CHANNELS.markAddressed,
		guard((commentId: number, commit: unknown): Promise<ReviewComment> => {
			if (!Number.isInteger(commentId)) throw new Error('That is not a comment.');
			// A commit, or nothing. Anything else is not written into a comment body.
			const sha = typeof commit === 'string' && /^[0-9a-f]{7,40}$/.test(commit) ? commit : null;
			return designRepo.setAddressed(commentId, sha);
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

	return { publish: (force = false) => publisher.publish(force) };
};
