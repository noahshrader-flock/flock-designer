import { type BrowserWindow, clipboard, dialog, ipcMain, shell } from 'electron';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import {
	CHANNELS,
	type Checkout,
	type CheckoutSuggestion,
	type MarkerRequest,
	PAGE_HOLD_REASONS,
	type PageBounds,
	type PageHoldReason,
	type MoveToCodePlan,
	type Person,
	type PageStatus,
	type PrototypeAddressed,
	type PrototypeReadiness,
	type Project,
	type Repository,
	type PublishStatus,
	type Result,
	type ReviewComment,
} from '../shared/contract';
import { AGENT_BUSY, type AgentExtras, AgentRunner, agentReadiness, locateClaude } from './services/agent';
import { SessionMemory, findEditor, openFolder, openSession, resumeCommand } from './services/editor';
import { CODEBASE_SKILL, HANDOFF_FILE, HANDOFF_SKILL, codebaseWorkPreamble, commandLine, handoffTask } from './services/engineeringHandoff';
import { lastVerdict } from '../shared/handoff';
import { type ShareRunner, previewIsUp, pullRequestText } from './services/share';
import { realShareTools } from './services/shareTools';
import { buildContextReceipt } from './services/contextReceipt';
import { DESCRIPTOR_PATH, readDescriptor } from './services/descriptor';
import { branchCommit, branchExists, isRepository, readCheckout, recentBranches, runGit } from './services/git';
import { assertUsableProjectId, codebaseBranchFor, continueIteration, createIteration, readIterations, recordPreview, recordedIteration } from './services/iterations';
import { findProductCheckouts, recordsRootFor } from './services/discovery';
import { gitHubRepoOf, mergeRepositories, originOf, visibleRepositories } from './services/repositories';
import { classify, readBranchProjects } from './services/branchProjects';
import { RuntimeManager } from './services/runtime';
import { ADDRESS_SKILL, chooseComment, prepareAddress } from './services/address';
import { projectTitle, writeCommentsExport } from './services/commentsExport';
import { syncRecords } from './services/designSync';
import { syncBranches } from './services/branchSync';
import { PublishManager, publishInOrder } from './services/publisher';
import { DESIGN_REPO, DesignRepo } from './services/designRepo';
import type { PageView } from './services/pageView';
import { assertPreviewUrl, sanitizeAnchor, sanitizePicture } from '../shared/anchor';
import type { GitHubSession } from './services/githubSession';
import { OpenedCheckouts } from './services/session';
import { readFolderProjects } from './services/localProjects';
import {
	isRecordName,
	iterationLabel,
	latestIterationName,
	mergeProjects,
	parsePrototypeName,
	parseSelectedVersion,
	prototypeKey,
	prototypePagePath,
	selectedVersionPath,
	selectedVersionText,
	unionLocal,
	workKind,
} from '../shared/projects';
import { resolveInside } from './services/paths';
import { PrototypeServer } from './services/prototypeServer';
import { esbuildEntry, sharedFilesOf } from './services/prototypeBundle';
import { type PrototypeChange, prototypeWork, whereTheChangeGoes } from './services/prototypeWork';
import { pageStatus, publish, recordsFrom } from './services/pages';
import {
	BUILD_SKILL,
	MOVE_SKILL,
	type RecordStore,
	assertPrototypeName,
	cloneStore,
	moveToCodeTask,
	prototypeAddressTask,
	prototypeBuildTask,
	prototypeReadable,
	type PrototypeSources,
} from './services/prototype';
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
	/** Where prototypes are built before they are saved: the app's own folder, never a repository. */
	prototypesRoot?: string;
	prototypeServer?: PrototypeServer;
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
	prototypesRoot = join(tmpdir(), 'flock-designer-prototypes'),
	prototypeServer = new PrototypeServer(),
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
		return saved !== null && isRepository(saved) && existsSync(join(saved, DESCRIPTOR_PATH)) ? saved : null;
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
			throw new Error(`The agent is working in ${basename(canonical)}, and this would change its branch. Wait for it to finish, or take it over, then try again.`);
		}
	};

	ipcMain.handle(
		CHANNELS.createIteration,
		// Codebase work only: a prototype has no branch, and is made by createPrototype.
		guard(async (root: string, projectId: string, note: string, from?: string) => {
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
			return written(await createIteration(canonical, recordsRoot, descriptor, projectId, note, branch));
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

	/**
	 * Starts a run the person can come back to: tagged with its branch, its conversation named and kept (so it can
	 * be continued in VS Code), and given the shared guidance to read. Every run in a product checkout starts here.
	 */
	const startTracked = (
		canonical: string,
		projectId: string,
		task: string,
		{ branch, addDirs, purpose }: { branch: string | null; addDirs: string[]; purpose?: AgentExtras['purpose'] },
	) => {
		const session = randomUUID();
		const shared = sharedGuidance(canonical);
		const started = agent.start(canonical, projectId, `${task}${shared.note}`, {
			// The project's records live in the design repository, beside the product checkout.
			addDirs,
			readOnly: shared.dirs,
			...(branch !== null ? { work: branch } : {}),
			...(purpose ? { purpose } : {}),
			session,
			name: `Flock Designer: ${projectId}`,
		});
		if (started.state === 'running' && branch !== null) sessions.write(canonical, branch, session);
		return started;
	};

	ipcMain.handle(
		CHANNELS.startAgent,
		guard(async (root: string, projectId: string, task: string) => {
			// Same rule startCommand applies. This one is interpolated into the agent's
			// prompt, and the agent runs unattended with edit permission, so an
			// unchecked value here is prompt injection rather than argv injection.
			assertUsableProjectId(projectId);
			const canonical = opened.require(root);
			const branch = (await readCheckout(canonical)).branch;
			const now = agent.status();
			if (now.state === 'running') {
				// The same work asked twice (the screen opened twice) joins its run; anything else must not be
				// mistaken for it, or the screen would wait on someone else's run and report this work as done.
				if (branch !== null && now.work === branch) return now;
				throw new Error(AGENT_BUSY);
			}
			// On the project's codebase branch, the shared rules for unattended codebase work, and this product's light check.
			const descriptor = descriptorFor(root);
			const skill = branch === codebaseBranchFor(descriptor, projectId) ? await readDesignFile(CODEBASE_SKILL) : null;
			const preamble = skill ? codebaseWorkPreamble(skill, commandLine(descriptor.commands, 'check-iteration', projectId)) : '';
			// A prototype being moved into the code is read from the app's own copy of it.
			const prototypeFolder = join(prototypesRoot, projectId);
			return startTracked(canonical, projectId, `${preamble}${task}`, {
				branch,
				addDirs: [recordsFor(canonical), ...(existsSync(prototypeFolder) ? [prototypeFolder] : [])],
			});
		}),
	);

	// Handing the work to the person, in VS Code. Only ever on a click: it opens another application.
	ipcMain.handle(
		CHANNELS.editorState,
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
		guard(async (root: string, branch: string): Promise<'editor' | 'terminal'> => {
			const canonical = opened.require(root);
			const found = sessions.read(canonical, String(branch));
			if (!found) throw new Error('There is no agent conversation for this work on this machine.');
			// Taking over a run still going: one conversation has one writer, so the app's run stops, but only once
			// the way to continue it is there: a folder that would not open must not cost the run.
			const takeOver = () => {
				if (agent.runningSession() === found.session) agent.stop();
			};
			const editor = findEditor();
			if (editor) {
				await openSession(editor, found, takeOver);
				return 'editor';
			}
			clipboard.writeText(resumeCommand(locateClaude(), found));
			takeOver();
			await dialog.showMessageBox({
				type: 'info',
				message: 'The command to continue is copied',
				detail: 'VS Code with the Claude Code extension is not installed here. Paste the command into a terminal to continue the same conversation.',
			});
			return 'terminal';
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
			const skill = await readDesignFile(ADDRESS_SKILL);
			const prepared = await prepareAddress(
				{
					readComments: () => designRepo.readComments(projectId, iteration.branch),
					checkout: () => readCheckout(canonical),
					agentRunning: () => agent.status().state === 'running',
					skill: () => skill,
					title: projectTitle(recordsRoot, projectId),
				},
				{ recordsRoot, projectId, iteration, commentId },
			);
			return startTracked(canonical, projectId, prepared.task, { branch: null, addDirs: [recordsRoot] });
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
					kind: workKind(iteration),
					projectId,
					name,
					branch: iteration.branch,
					...pullRequestText(projectId, name),
				},
				tools: realShareTools(canonical),
				// Saved, then published, and only then is the link called ready: a reviewer cannot open what is not up yet.
				record: async (url, prUrl) => {
					recordPreview(recordsRoot, projectId, name, url, shared, prUrl);
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
	 * Prototypes. Everything they write goes to one place per machine: the design repository's
	 * clone when there is one here, so the publisher sends it like every other record, and otherwise
	 * GitHub directly.
	 */
	/** The design repository's clone on this machine, when there is one. */
	const designClone = (): string | null => {
		const root = trustedRoot();
		const recordsRoot = root === null ? null : recordsRootFor(root);
		return recordsRoot === null ? null : dirname(recordsRoot);
	};
	const recordStore = (): RecordStore => {
		const clone = designClone();
		return clone !== null
			? cloneStore(clone, () => void publisher.publish(true))
			: {
					read: (path) => designRepo.readFile(path),
					has: (path) => designRepo.hasFile(path),
					write: (path, content, message) => designRepo.writeFile(path, content, message),
				};
	};
	/**
	 * A file from the design repository: through the record store, and from GitHub when the clone here does not have
	 * it yet (a colleague's work not pulled). Without a clone the store already is GitHub, so it is asked once.
	 */
	const readDesignFile = async (path: string): Promise<string | null> => {
		const here = await recordStore().read(path);
		return here !== null || designClone() === null ? here : designRepo.readFile(path);
	};
	/** A shared skill, which the agent's task is built from: read as the flkd command reads it. */
	const readSkillText = (path: string): Promise<string> => work.skill(path);
	/**
	 * Making prototypes: the same code the flkd command runs from Claude Code, given this app's folder, the repository
	 * this person accepted, and this app's store.
	 */
	const work = prototypeWork({
		prototypesRoot,
		productRoot: () => {
			const root = trustedRoot();
			return root === null ? null : opened.require(root);
		},
		store: recordStore,
		readDesignFile,
		esbuild: esbuildEntry,
	});
	/** Whether a prototype can be built from this accepted repository here. */
	const prototypeReadiness = (root: string): PrototypeReadiness => work.readiness(opened.require(root));
	/** What building a prototype and changing one share: what it is modelled on, read once, and how it is built. */
	const prototypeRun = async (projectId: string, name: string, modelledOn = name) =>
		work.buildPlan(projectId, name, await once(`source:${projectId}`, () => work.sources(projectId, modelledOn)));
	/** Its agent, in the folder it was built in, reading the product read-only, and nothing committed. */
	const startPrototypeAgent = (projectId: string, name: string, sources: PrototypeSources, task: string) =>
		agent.start(work.dir(projectId), projectId, task, { bare: true, readOnly: prototypeReadable(sources), work: prototypeKey(projectId, name) });
	/** Makes the shared files a page points at available beside it: this machine's copy, else the design repository's. */
	const serveShared = async (html: string): Promise<void> => {
		for (const n of sharedFilesOf(html)) {
			if (prototypeServer.hasShared(n)) continue;
			const uri = await work.sharedText(n);
			if (uri !== null) prototypeServer.share(n, uri);
		}
	};
	/** The page: this machine's newest build first (built again when its source changed), then the saved one. */
	const prototypePage = (projectId: string, name: string): Promise<string | null> => work.page(projectId, name, agent.status().state === 'running');
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

	ipcMain.handle(CHANNELS.prototypeReadiness, guard((root: string) => prototypeReadiness(root)));

	ipcMain.handle(
		CHANNELS.createPrototype,
		guard(async (projectId: string, title: string, note: string, from: { root: string; branch: string } | null) => {
			// What it is modelled on is not optional: a prototype is built from a repository's real design system.
			if (!from) throw new Error('A prototype is modelled on a branch of a repository on this machine. Choose one.');
			// Only a repository this person accepted.
			return work.start(opened.require(from.root), { projectId, title, note, branch: from.branch, me: me() });
		}),
	);

	ipcMain.handle(
		CHANNELS.buildPrototype,
		guard(async (projectId: string, name: string, request: string) => {
			assertUsableProjectId(projectId);
			assertPrototypeName(name);
			// The screen can ask twice (it is opened twice in development, and Try again asks again). One agent is
			// already building: this request waits on that run rather than starting a second or failing.
			if (agent.status().state === 'running') return agent.status();
			const skill = await readSkillText(BUILD_SKILL);
			const { build, sources } = await prototypeRun(projectId, name);
			return startPrototypeAgent(projectId, name, sources, prototypeBuildTask({ skill, build, sources, request: String(request) }));
		}),
	);

	/**
	 * Acting on one comment on a prototype. The same steps as on a branch -- comments read from GitHub now, the file
	 * written from that read, then the agent started -- but the agent changes the prototype's source in the app's own
	 * folder, where it was built, and nothing is committed. What others commented on is never changed under them: the
	 * service says which iteration the change goes in (`startChange`), and `finishPrototypeAddress` records and saves it.
	 */
	const prototypeChanges = new Map<number, { projectId: string; change: PrototypeChange }>();
	/**
	 * Finishes one: a changed prototype built, recorded when new, and saved, and the comment marked with where the change
	 * is. Run by the screen when the agent ends, and when the prototype is opened again, so a change made while the screen
	 * was left is never stranded.
	 */
	const finishPrototypeChange = async (commentId: number): Promise<PrototypeAddressed> => {
		const pending = prototypeChanges.get(commentId);
		if (!pending) throw new Error('There is no change to this comment waiting to be saved.');
		if (agent.status().state === 'running') throw new Error(AGENT_BUSY);
		prototypeChanges.delete(commentId);
		const { projectId, change } = pending;
		const { version, made } = await work.finishChange(projectId, change, me(), `For a comment on ${iterationLabel(change.from)}`);
		// Either way: a run that changed nothing clears the mark an earlier one left.
		const comment = await designRepo.setAddressed(commentId, version, version === null ? null : change.target);
		if (version !== null) publishInBackground(projectId, change.target);
		return { changed: version !== null, iteration: change.target, made, comment };
	};
	const finishPrototypeChanges = async (projectId: string): Promise<void> => {
		if (agent.status().state === 'running') return;
		for (const [commentId, pending] of [...prototypeChanges]) {
			// One that does not build is left as it is on this machine, unrecorded: nobody is watching to be told why, and
			// the next Address on it starts again from what people saw.
			if (pending.projectId === projectId) await finishPrototypeChange(commentId).catch(() => undefined);
		}
	};
	ipcMain.handle(
		CHANNELS.addressPrototype,
		guard(async (projectId: string, name: string, commentId: number) => {
			assertUsableProjectId(projectId);
			assertPrototypeName(name);
			if (!Number.isSafeInteger(commentId)) throw new Error('That is not a comment.');
			if (agent.status().state === 'running') throw new Error(AGENT_BUSY);
			// One left from a run whose screen was closed is finished first, or this run would start from the same copy.
			await finishPrototypeChanges(projectId);
			const addressSkill = await readSkillText(ADDRESS_SKILL);
			const buildSkill = await readSkillText(BUILD_SKILL);
			// Read now, not earlier: this is what makes the file current, and what says who has commented.
			const comments = await designRepo.readComments(projectId, prototypeKey(projectId, name));
			const written = writeCommentsExport(prototypesRoot, {
				projectId,
				title: await work.title(projectId),
				iteration: { name, branch: prototypeKey(projectId, name) },
				comments,
				generatedAt: new Date(),
			});
			const number = chooseComment(comments, commentId);
			const change = await work.startChange(projectId, name, async (it) =>
				(it.name === name ? comments : await designRepo.readComments(projectId, it.branch)).map((c) => c.author),
			);
			// Modelled on what the iteration it comes from was: a new one has no record of its own yet.
			const { build, sources } = await prototypeRun(projectId, change.target, change.from.name);
			prototypeChanges.set(commentId, { projectId, change });
			const where = whereTheChangeGoes(change, name);
			return startPrototypeAgent(projectId, name, sources, prototypeAddressTask({ addressSkill, buildSkill, build, sources, commentsPath: written.path, number, name, where }));
		}),
	);
	/**
	 * The iteration's published page. Asked of GitHub as the person signed in to the app; nothing to say when they are
	 * not. Opening it works the address out again here, so the window never hands this an address to open.
	 */
	const publishedPage = async (projectId: string, name: string): Promise<PageStatus> => {
		assertUsableProjectId(projectId);
		assertPrototypeName(name);
		if (github.state().state !== 'signedIn') return { state: 'none' };
		const key = prototypeKey(projectId, name);
		if (publishing.has(key)) return { state: 'publishing' };
		let status: PageStatus;
		try {
			status = await pageStatus(github, DESIGN_REPO, projectId, name);
		} catch (err) {
			// Most often the app's GitHub permission: reading the site and its deploys needs Pages and Deployments.
			return { state: 'unavailable', why: `GitHub would not say whether this is published: ${err instanceof Error ? err.message : String(err)}` };
		}
		const stopped = publishStopped.get(key);
		return status.state === 'unpublished' && stopped ? { state: 'unpublished', why: stopped } : status;
	};
	/**
	 * Publishes what the app itself just made (a prototype it built, or a change Address made), in the background, as
	 * the agent publishes from Claude Code: the same code. What stopped it is kept, so the screen can say why the page
	 * is not published.
	 */
	const publishing = new Map<string, Promise<void>>();
	const publishStopped = new Map<string, string>();
	const publishInBackground = (projectId: string, name: string): void => {
		const key = prototypeKey(projectId, name);
		if (publishing.has(key) || github.state().state !== 'signedIn') return;
		const run = (async () => {
			await publish({ github, ref: DESIGN_REPO, ...(await recordsFrom(designClone())), projectId, name });
		})()
			.then(() => void publishStopped.delete(key))
			.catch((err: unknown) => void publishStopped.set(key, err instanceof Error ? err.message : String(err)))
			.finally(() => publishing.delete(key));
		publishing.set(key, run);
	};
	ipcMain.handle(CHANNELS.publishedPage, guard((projectId: string, name: string) => publishedPage(projectId, name)));
	ipcMain.handle(
		CHANNELS.openPublishedPage,
		guard(async (projectId: string, name: string): Promise<null> => {
			const status = await publishedPage(projectId, name);
			if (status.state !== 'published') throw new Error('This iteration is not on its page yet.');
			await shell.openExternal(assertPreviewUrl(status.url));
			return null;
		}),
	);
	ipcMain.handle(
		CHANNELS.finishPrototypeAddress,
		guard((commentId: number): Promise<PrototypeAddressed> => finishPrototypeChange(commentId)),
	);

	ipcMain.handle(
		CHANNELS.savePrototype,
		guard(async (projectId: string, name: string): Promise<null> => {
			await work.save(projectId, name);
			publishInBackground(projectId, name);
			return null;
		}),
	);

	ipcMain.handle(
		CHANNELS.selectedVersion,
		guard(async (projectId: string): Promise<number | null> => {
			assertUsableProjectId(projectId);
			return parseSelectedVersion(await readDesignFile(selectedVersionPath(projectId)));
		}),
	);
	ipcMain.handle(
		CHANNELS.selectVersion,
		guard(async (projectId: string, version: number | null): Promise<null> => {
			assertUsableProjectId(projectId);
			if (version !== null && !(Number.isSafeInteger(version) && version > 0)) throw new Error('That is not a version.');
			const names = (await work.records(projectId)).map((r) => r.name);
			const versions = names.flatMap((n) => parsePrototypeName(n)?.version ?? []);
			if (version !== null && !versions.includes(version)) throw new Error(`${projectId} has no V${version}.`);
			await recordStore().write(
				selectedVersionPath(projectId),
				selectedVersionText(version),
				version === null ? `${projectId}: no version selected` : `${projectId}: V${version} selected`,
			);
			// The site's latest follows it, so it is published, by the iteration latest now leads to.
			const newest = latestIterationName(names, version ?? Math.max(...versions));
			if (newest !== null) publishInBackground(projectId, newest);
			return null;
		}),
	);

	ipcMain.handle(
		CHANNELS.openPrototype,
		guard(async (projectId: string, name: string): Promise<string> => {
			await finishPrototypeChanges(projectId);
			const html = await prototypePage(projectId, name);
			if (html === null) throw new Error('This prototype has no page yet.');
			// A page built here but never saved (the screen was left, or gave up, while the agent finished) is saved
			// now: what this machine shows is what reviewers get, and no finished page is stranded on one machine.
			const local = work.file(projectId, name);
			const path = prototypePagePath(projectId, name);
			if (existsSync(local) && agent.status().state !== 'running' && (await recordStore().read(path)) !== html) await work.keep(projectId, name, html);
			await serveShared(html);
			return prototypeServer.serve(`${projectId}/${name}`, html);
		}),
	);

	ipcMain.handle(
		CHANNELS.moveToCodePlan,
		guard(async (root: string, projectId: string, name: string): Promise<MoveToCodePlan> => {
			assertUsableProjectId(projectId);
			assertPrototypeName(name);
			const canonical = opened.require(root);
			const branch = codebaseBranchFor(descriptorFor(root), projectId);
			const records = await work.records(projectId);
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

	// Handoff: the heavy pass on codebase work, started here so the checks and the start are one step. Where the
	// branch stood when it started is kept, so the verdict can tell a handoff written now from one left from before.
	const handoffStarts = new Map<string, { branch: string; head: string }>();
	ipcMain.handle(
		CHANNELS.startHandoff,
		guard(async (root: string, projectId: string) => {
			assertUsableProjectId(projectId);
			const canonical = opened.require(root);
			const recordsRoot = recordsFor(canonical);
			const descriptor = descriptorFor(root);
			const iteration = await recordedIteration(canonical, recordsRoot, descriptor, projectId, 'codebase');
			const here = await readCheckout(canonical);
			if (here.branch !== iteration.branch) throw new Error(`Open ${iteration.branch} first: a handoff checks the work where it is.`);
			if (agent.status().state === 'running') throw new Error(AGENT_BUSY);
			const skill = await readSkillText(HANDOFF_SKILL);
			const task = handoffTask({
				skill,
				projectId,
				branch: iteration.branch,
				gate: commandLine(descriptor.commands, 'handoff', projectId),
				lightCheck: commandLine(descriptor.commands, 'check-iteration', projectId),
			});
			handoffStarts.set(canonical, { branch: iteration.branch, head: (await runGit(canonical, ['rev-parse', 'HEAD'])).trim() });
			return startTracked(canonical, projectId, task, { branch: iteration.branch, addDirs: [recordsRoot], purpose: 'handoff' });
		}),
	);
	/**
	 * Whether the last Handoff here found the work ready: the run's own last verdict says so, and HANDOFF.md was
	 * committed since it started. Null when this app did not start one on this branch (it was restarted since).
	 */
	ipcMain.handle(
		CHANNELS.handoffResult,
		guard(async (root: string): Promise<boolean | null> => {
			const canonical = opened.require(root);
			const started = handoffStarts.get(canonical);
			const here = await readCheckout(canonical);
			const recent = agent.recentLines();
			if (!started || started.branch !== here.branch || recent.work !== here.branch) return null;
			const written = (await runGit(canonical, ['diff', '--name-only', started.head, 'HEAD', '--', HANDOFF_FILE])).trim() !== '';
			return written && lastVerdict(recent.lines) === 'ready';
		}),
	);

	ipcMain.handle(
		CHANNELS.prepareMoveToCode,
		guard(async (projectId: string, name: string): Promise<string> => {
			const root = trustedRoot();
			if (root === null) throw new Error('Building in the codebase needs the product repository on this machine.');
			const recordsRoot = recordsFor(opened.require(root));
			const skill = await readSkillText(MOVE_SKILL);
			// The page is copied where the agent is allowed to read it, so it works from the version saved, wherever that is.
			const html = await prototypePage(projectId, name);
			if (html === null) throw new Error('This prototype has no page yet.');
			const pageFile = work.file(projectId, name);
			writeFileSync(pageFile, html);
			// Its React source too, when it has one: real components are a far better start than a page.
			const sourceFile = work.sourceFile(projectId, name);
			const source = await work.sourceText(projectId, name);
			if (source !== null) writeFileSync(sourceFile, source);
			const basedOn = (await work.record(projectId, name))?.basedOn;
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
	// A prototype is one page: the app's own server says which addresses are its, never the window.
	ipcMain.handle(CHANNELS.pageOpen, guard(async (url: string) => nothing(await page.open(String(url), { singlePage: prototypeServer.owns(String(url)) }))));
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
