import { randomUUID } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import type { BuildInCodebase, BuildInCodebasePlan } from '../../shared/contract';
import { prototypeKey } from '../../shared/designPaths';
import { lastVerdict } from '../../shared/handoff';
import { iterationLabel, workKind } from '../../shared/work';
import { arg, handle } from '../handle';
import { A11Y_COMMAND, productTarget, taskAccessibility } from '../services/accessibilityBrief';
import { ADDRESS_SKILL, prepareAddress } from '../services/address';
import { type AgentExtras, agentReadiness } from '../services/agent';
import { type CheckoutParts, codebaseTask, handoffTask, buildInCodebaseTask } from '../services/agentTasks';
import { projectTitle } from '../services/commentsExport';
import { designSystemCheckout, readDescriptor } from '../services/descriptor';
import { recordsRootFor } from '../services/discovery';
import { resumeCommand, startCommand } from '../services/editor';
import { CODEBASE_SKILL, HANDOFF_FILE, HANDOFF_SKILL, commandLine } from '../services/engineeringHandoff';
import { branchCommit, changedSince, headCommit, readCheckout } from '../services/git';
import { codebaseBranchFor, recordPreview, recordedIteration } from '../services/iterations';
import { MOVE_SKILL, buildInCodebasePrompt } from '../services/prototype';
import { pullRequestText } from '../services/share';
import type { IpcDeps } from '../ipc';

/**
 * Codebase work in a product checkout: the agent's runs, handing work to VS Code, Address on a branch, sharing a
 * preview, building a prototype in the codebase, and Handoff.
 */
export const registerCodebase = (d: IpcDeps): void => {
	const {
		agent,
		agentBusy,
		checkout,
		codebase,
		designRepo,
		ports,
		prototypeAccessibility,
		prototypePage,
		prototypesRoot,
		publisher,
		readDesignFile,
		readSkillText,
		refuseWhileBusy,
		sessions,
		share,
		work,
	} = d;

	/** The accessibility section of a codebase task (T7): the product's target from its own manifest, on the branch it is on. */
	const codebaseAccessibility = (canonical: string, findings?: Parameters<typeof taskAccessibility>[2]): Promise<string> => {
		const descriptor = readDescriptor(canonical);
		// The product's own check, where its setup declares one (Coke's `a11y`), run as the work goes; its gate runs it at handoff.
		const check = commandLine(descriptor.commands, A11Y_COMMAND, '');
		return taskAccessibility(readSkillText, productTarget(join(canonical, descriptor.contextDir), descriptor.product), findings, check);
	};

	/**
	 * What a codebase run may read besides the checkout: the shared skills and standards the product's guidance
	 * points at, and the design system's own guidance (`designSystemCheckout`). Read only, and named in the task, since a folder
	 * the agent has not been told about is one it never opens.
	 */
	const sharedGuidance = (canonical: string): { dirs: string[]; note: string } => {
		const designRoot = recordsRootFor(canonical);
		const designSystem = readDescriptor(canonical).designSystem;
		const named: Array<[string, string | null]> = [
			["Shared agents (the product's shims point here)", designRoot === null ? null : join(dirname(designRoot), 'agents')],
			['Shared skills (a `skills/…` path in any guidance is here)', designRoot === null ? null : join(dirname(designRoot), 'skills')],
			['Shared standards', designRoot === null ? null : join(dirname(designRoot), 'standards')],
			['Shared logging (how the product logs what went wrong)', designRoot === null ? null : join(dirname(designRoot), 'knowledge')],
			["The design system's checkout (its guidance and source)", designSystemCheckout(canonical, designSystem)],
		];
		const found = named.filter((n): n is [string, string] => n[1] !== null && existsSync(n[1]));
		if (!found.length) return { dirs: [], note: '' };
		return {
			dirs: found.map(([, dir]) => dir),
			note: ['## Also yours to read (never change)', '', ...found.map(([what, dir]) => `- ${what}: \`${dir}\``)].join('\n'),
		};
	};

	/**
	 * What every run in a product checkout is given besides its own task (`CheckoutParts`, put in place by `agentTasks`),
	 * and the folders it may read for them. `findings`: what a prototype's own accessibility check left open, to fix.
	 */
	const checkoutParts = async (
		canonical: string,
		projectId: string,
		findings?: Parameters<typeof taskAccessibility>[2],
	): Promise<{ parts: CheckoutParts; readOnly: string[] }> => {
		const shared = sharedGuidance(canonical);
		return {
			readOnly: shared.dirs,
			parts: {
				lightCheck: commandLine(readDescriptor(canonical).commands, 'check-iteration', projectId),
				shared: shared.note,
				accessibility: await codebaseAccessibility(canonical, findings),
				// The voice and tone (T9), from the design system beside this product; nothing while it is blank.
				voice: await work.voice(canonical),
			},
		};
	};

	/**
	 * Starts a run the person can come back to: tagged with its branch, and its conversation named and kept, so it can
	 * be continued in VS Code. Every run in a product checkout starts here, with its whole task (`agentTasks`).
	 */
	const startTracked = (
		canonical: string,
		projectId: string,
		task: string,
		{ branch, addDirs, readOnly, purpose }: { branch: string | null; addDirs: string[]; readOnly: string[]; purpose?: AgentExtras['purpose'] },
	) => {
		const session = randomUUID();
		// Joining the run already going on this branch keeps that run's conversation, not this new name for it.
		const joining = agentBusy();
		const started = agent.start(canonical, projectId, task, {
			// The project's records live in the design repository, beside the product checkout.
			addDirs,
			readOnly,
			...(branch !== null ? { work: branch } : {}),
			...(purpose ? { purpose } : {}),
			session,
			name: `DSNR: ${projectId}`,
		});
		if (!joining && started.state === 'running' && branch !== null) sessions.write(canonical, branch, session);
		return started;
	};

	// Handoff: the heavy pass on codebase work, started here so the checks and the start are one step. Where the
	// branch stood when it started is kept, so the verdict can tell a handoff written now from one left from before.
	const handoffStarts = new Map<string, { branch: string; head: string }>();

	handle('startAgent', [checkout, arg.projectId, arg.words], async (workIn, projectId, task) => {
		const { canonical, descriptor } = workIn;
		const branch = (await readCheckout(canonical)).branch;
		// On the project's codebase branch, the shared rules for unattended codebase work, and this product's light check.
		const unattended = branch === codebaseBranchFor(descriptor, projectId) ? await readDesignFile(CODEBASE_SKILL) : null;
		// A prototype being moved into the code is read from the app's own copy of it.
		const prototypeFolder = join(prototypesRoot, projectId);
		const { parts, readOnly } = await checkoutParts(canonical, projectId);
		return startTracked(canonical, projectId, codebaseTask({ unattended, task }, parts), {
			branch,
			addDirs: [workIn.recordsRoot, ...(existsSync(prototypeFolder) ? [prototypeFolder] : [])],
			readOnly,
		});
	});
	// Handing the work to the person, in VS Code. Only ever on a click: it opens another application.
	handle('editorState', [checkout, arg.branch], (workIn, branch) => ({
		editor: ports.editor.find() !== null,
		session: sessions.read(workIn.canonical, branch) !== null,
	}));
	handle('openInEditor', [checkout], async (workIn) => {
		const { canonical } = workIn;
		const editor = ports.editor.find();
		if (editor) await ports.editor.openFolder(editor, canonical);
		else await ports.openPath(canonical);
		return null;
	});
	handle('continueInClaude', [checkout, arg.branch], async (workIn, branch): Promise<'editor' | 'terminal'> => {
		const { canonical } = workIn;
		const found = sessions.read(canonical, branch);
		if (!found) throw new Error('There is no agent conversation for this work on this machine.');
		// Taking over a run still going: one conversation has one writer, so the app's run stops, but only once
		// the way to continue it is there: a folder that would not open must not cost the run.
		const takeOver = () => {
			if (agent.runningSession() === found.session) agent.stop();
		};
		const editor = ports.editor.find();
		if (editor) {
			await ports.editor.openSession(editor, found, takeOver);
			return 'editor';
		}
		await ports.copy(resumeCommand(ports.claude(), found));
		takeOver();
		await ports.tell({
			message: 'The command to continue is copied',
			detail: 'VS Code with the Claude Code extension is not installed here. Paste the command into a terminal to continue the same conversation.',
		});
		return 'terminal';
	});
	handle('agentStatus', [], () => agent.status());
	handle('agentRecent', [], () => agent.recentLines());
	handle('stopAgent', [], () => {
		agent.stop();
		return null;
	});
	handle('agentReadiness', [], () => agentReadiness());
	// One click: read the comments now, write the file from that read, then start the agent. Nothing
	// a reviewer wrote is put in the task; it reaches the agent only through the file.
	handle('addressComments', [checkout, arg.projectId, arg.iterationName, arg.comment], async (workIn, projectId, name, comment) => {
		// There is no batch: a request with no comment is a mistake, not a request for all of them.
		const { canonical, recordsRoot } = workIn;
		const iteration = await recordedIteration(canonical, recordsRoot, workIn.descriptor, projectId, name);
		const skill = await readDesignFile(ADDRESS_SKILL);
		const prepared = await prepareAddress(
			{
				readComments: () => designRepo.threads.readComments(iteration.branch),
				checkout: () => readCheckout(canonical),
				agentRunning: agentBusy,
				skill: () => skill,
				title: projectTitle(recordsRoot, projectId),
			},
			{ recordsRoot, projectId, iteration, comment },
		);
		const { parts, readOnly } = await checkoutParts(canonical, projectId);
		return startTracked(canonical, projectId, codebaseTask({ unattended: null, task: prepared.task }, parts), {
			branch: null,
			addDirs: [recordsRoot],
			readOnly,
		});
	});
	// Sharing. The branch comes from this person's own record, never from the window, and
	// the repository's descriptor says what a share is. Starts and returns: it takes minutes.
	handle('shareIteration', [checkout, arg.projectId, arg.iterationName], async (workIn, projectId, name) => {
		const { canonical, descriptor, recordsRoot } = workIn;
		const { share: how } = descriptor;
		if (!how) {
			throw new Error(`${descriptor.product} does not say how a shared preview is built, so it cannot be shared from here.`);
		}
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
			tools: ports.shareTools(canonical),
			// Saved, then published, and only then is the link called ready: a reviewer cannot open what is not up yet.
			record: async (url, prUrl) => {
				recordPreview(recordsRoot, projectId, name, url, shared, prUrl);
				await publisher.publish(true);
			},
		});
	});
	handle('shareStatus', [], () => share.status());
	handle('buildInCodebasePlan', [checkout, arg.projectId, arg.prototypeName], async (workIn, projectId, name): Promise<BuildInCodebasePlan> => {
		const { canonical } = workIn;
		const { branch, exists, recorded, started, records } = await codebase.of(workIn, projectId);
		const basedOn = records.find((i) => i.name === name)?.basedOn;
		const here = await readCheckout(canonical);
		return {
			branch,
			exists,
			recorded,
			started,
			repository: basename(canonical),
			basedOn: basedOn ? { repository: basedOn.repository, branch: basedOn.branch } : null,
			current: here.branch,
			clean: here.clean,
		};
	});
	handle('startHandoff', [checkout, arg.projectId], async (workIn, projectId) => {
		const { canonical, recordsRoot, descriptor } = workIn;
		const iteration = await recordedIteration(canonical, recordsRoot, descriptor, projectId, 'codebase');
		const here = await readCheckout(canonical);
		if (here.branch !== iteration.branch) throw new Error(`Open ${iteration.branch} first: a handoff checks the work where it is.`);
		refuseWhileBusy();
		const skill = await readSkillText(HANDOFF_SKILL);
		const { parts, readOnly } = await checkoutParts(canonical, projectId);
		const task = handoffTask({ skill, projectId, branch: iteration.branch, gate: commandLine(descriptor.commands, 'handoff', projectId) }, parts);
		handoffStarts.set(canonical, { branch: iteration.branch, head: await headCommit(canonical) });
		return startTracked(canonical, projectId, task, { branch: iteration.branch, addDirs: [recordsRoot], readOnly, purpose: 'handoff' });
	});
	/**
	 * Whether the last Handoff here found the work ready: the run's own last verdict says so, and HANDOFF.md was
	 * committed since it started. Null when this app did not start one on this branch (it was restarted since).
	 */
	handle('handoffResult', [checkout], async (workIn): Promise<boolean | null> => {
		const { canonical } = workIn;
		const started = handoffStarts.get(canonical);
		const here = await readCheckout(canonical);
		const recent = agent.recentLines();
		if (!started || started.branch !== here.branch || recent.work !== here.branch) return null;
		const committed = await changedSince(canonical, started.head, HANDOFF_FILE);
		return committed && lastVerdict(recent.lines) === 'ready';
	});
	/**
	 * Build, from a prototype: its branch and record are made here, as all codebase work's are (or, when the work was
	 * started before, picked up where it is), and the building is handed to Claude Code in the product repository, where
	 * the person watches it and can step in. The task is written beside the prototype's own copy (the skill, the page and source to start from, where the audit
	 * goes); the conversation starts with a line pointing at it. In VS Code when it has Claude Code; otherwise the
	 * command that starts it in a terminal is put on the clipboard.
	 */
	handle(
		'buildInCodebase',
		[checkout, arg.projectId, arg.prototypeName, arg.optional(arg.branch)],
		async (workIn, projectId, name, from): Promise<BuildInCodebase> => {
			const { canonical, recordsRoot } = workIn;
			const skill = await readSkillText(MOVE_SKILL);
			// The page and its source are copied where the agent can read them, so it works from the version saved.
			const html = await prototypePage(projectId, name);
			if (html === null) throw new Error('This prototype has no page yet.');
			const pageFile = work.file(projectId, name);
			const sourceFile = work.sourceFile(projectId, name);
			const source = await work.sourceText(projectId, name);
			const label = iterationLabel({ name, branch: prototypeKey(projectId, name) });
			// The branch first: nothing is written for the agent if the work cannot start (a dirty tree, work not found).
			// Work already started, here or recorded, is continued where it is; it is not started a second time.
			const { branch, started: continuing } = await codebase.of(workIn, projectId);
			if (continuing) await codebase.resume(workIn, projectId, branch);
			else await codebase.start(workIn, projectId, `From prototype ${label}`, from ?? undefined);
			writeFileSync(pageFile, html);
			if (source !== null) writeFileSync(sourceFile, source);
			const taskFile = join(dirname(pageFile), `${name}-into-code.md`);
			writeFileSync(
				taskFile,
				buildInCodebaseTask(
					{
						skill,
						pageFile,
						sourceFile: source !== null ? sourceFile : null,
						auditFile: join(recordsRoot, projectId, `audit-${name}.md`),
						name,
						basedOn: (await work.record(projectId, name))?.basedOn,
					},
					// Built toward the product's target from the start, with what the prototype's check left open: its page
					// checked now when it was not already. A check that cannot run leaves the findings out, never the move.
					(await checkoutParts(canonical, projectId, await prototypeAccessibility(projectId, name).catch(() => null))).parts,
				),
			);
			const prompt = buildInCodebasePrompt({ label, projectId, taskFile, continuing: continuing ? branch : null });
			const editor = ports.editor.find();
			if (editor) {
				await ports.editor.openPrompt(editor, canonical, prompt);
				return { editor: true, command: null };
			}
			const command = startCommand(ports.claude(), canonical, prompt);
			await ports.copy(command);
			return { editor: false, command };
		},
	);
};
