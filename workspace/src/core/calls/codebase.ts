import { randomUUID } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import type { BuildInCodebase, BuildInCodebasePlan } from '../../shared/contract';
import { lastVerdict } from '../../shared/handoff';
import { workLabel } from '../../shared/work';
import { arg, handle } from '../handle';
import { A11Y_COMMAND, productTarget, taskAccessibility } from '../services/accessibilityBrief';
import { type AgentExtras, agentReadiness } from '../services/agent';
import { type CheckoutParts, codebaseTask, guidePart, handoffTask, buildInCodebaseTask } from '../services/agentTasks';
import { designSystemCheckout, readDescriptor } from '../services/descriptor';
import { recordsRootFor } from '../services/discovery';
import { handToClaude } from '../services/editor';
import { CODEBASE_SKILL, HANDOFF_FILE, HANDOFF_SKILL, commandLine } from '../services/engineeringHandoff';
import { branchTip, changedSince, headCommit, readCheckout } from '../services/git';
import { codebaseBranchFor, recordHandoff, recordPath, recordPreview, recordedWork } from '../services/workRecords';
import { GUIDE, MOVE_SKILL, ROUTE_SKILL, buildInCodebasePrompt } from '../services/prototype';
import { pullRequestText } from '../services/share';
import type { CallsDeps } from '../calls';

/**
 * Codebase work in a product checkout: the agent's runs, handing work to VS Code, Address on a branch, sharing a
 * preview, building a prototype in the codebase, and Handoff.
 */
export const registerCodebase = (d: CallsDeps): void => {
	const {
		agent,
		agentBusy,
		checkout,
		codebase,
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

	/** The design repository's own folder beside this product (the one holding `agents/`, `skills/`, `standards/`), if found. */
	const sharedRoot = (canonical: string): string | null => {
		const records = recordsRootFor(canonical);
		return records === null ? null : dirname(records);
	};

	/**
	 * What a codebase run may read besides the checkout: the shared skills and standards the product's guidance
	 * points at, and the design system's own guidance (`designSystemCheckout`). Read only, and named in the task, since a folder
	 * the agent has not been told about is one it never opens.
	 */
	const sharedGuidance = (canonical: string): { dirs: string[]; note: string } => {
		const root = sharedRoot(canonical);
		const designSystem = readDescriptor(canonical).designSystem;
		const named: Array<[string, string | null]> = [
			["Shared agents (the product's shims point here)", root === null ? null : join(root, 'agents')],
			['Shared skills (a `skills/…` path in any guidance is here)', root === null ? null : join(root, 'skills')],
			['Shared standards', root === null ? null : join(root, 'standards')],
			['Shared logging (how the product logs what went wrong)', root === null ? null : join(root, 'knowledge')],
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
				guide: guidePart(await readSkillText(GUIDE), sharedRoot(canonical)),
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
	const handoffStarts = new Map<string, { projectId: string; branch: string; head: string }>();

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
	handle('agentStatus', [], () => agent.status());
	// Answered once the run, and every tool it started, has ended.
	handle('stopAgent', [], async () => {
		await agent.stop();
		return null;
	});
	handle('agentReadiness', [], () => agentReadiness());
	// One click: read the comments now, write the file from that read, then start the agent. Nothing
	// a reviewer wrote is put in the task; it reaches the agent only through the file.
	// Sharing. The branch comes from this person's own record, never from the window, and
	// the repository's descriptor says what a share is. Starts and returns: it takes minutes.
	handle('shareWork', [checkout, arg.projectId, arg.codebaseName], async (workIn, projectId, name) => {
		const { canonical, descriptor, recordsRoot } = workIn;
		const { share: how } = descriptor;
		if (!how) {
			throw new Error(`${descriptor.product} does not say how a shared preview is built, so it cannot be shared from here.`);
		}
		const codebaseRecord = await recordedWork(canonical, recordsRoot, descriptor, projectId, name);
		// Only what is committed goes up. Sharing a branch with unsaved edits would show reviewers less than the designer sees.
		const here = await readCheckout(canonical);
		if (here.branch === codebaseRecord.branch && !here.clean) {
			throw new Error(`There are uncommitted changes on ${codebaseRecord.branch}, and only committed work is shared. Commit them, then share again.`);
		}
		// The commit that goes up now, which is what reviewers will be looking at.
		const shared = (await branchTip(canonical, codebaseRecord.branch)) ?? undefined;
		return share.start({
			request: {
				share: how,
				projectId,
				name,
				branch: codebaseRecord.branch,
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
	handle('buildInCodebasePlan', [checkout, arg.projectId, arg.prototypeName], async (workIn, projectId, name): Promise<BuildInCodebasePlan> => {
		const { canonical } = workIn;
		const { branch, exists, recorded, started, setup, records } = await codebase.of(workIn, projectId);
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
			setup,
		};
	});
	handle('startHandoff', [checkout, arg.projectId], async (workIn, projectId) => {
		const { canonical, recordsRoot, descriptor } = workIn;
		const codebaseRecord = await recordedWork(canonical, recordsRoot, descriptor, projectId, 'codebase');
		const here = await readCheckout(canonical);
		if (here.branch !== codebaseRecord.branch) throw new Error(`Open ${codebaseRecord.branch} first: a handoff checks the work where it is.`);
		refuseWhileBusy();
		const skill = await readSkillText(HANDOFF_SKILL);
		const { parts, readOnly } = await checkoutParts(canonical, projectId);
		const missingRoute = codebaseRecord.route ? null : { skill: await readSkillText(ROUTE_SKILL), recordFile: recordPath(recordsRoot, projectId) };
		const task = handoffTask(
			{ skill, projectId, branch: codebaseRecord.branch, gate: commandLine(descriptor.commands, 'handoff', projectId), missingRoute },
			parts,
		);
		handoffStarts.set(canonical, { projectId, branch: codebaseRecord.branch, head: await headCommit(canonical) });
		return startTracked(canonical, projectId, task, { branch: codebaseRecord.branch, addDirs: [recordsRoot], readOnly, purpose: 'handoff' });
	});
	/**
	 * Whether the last Handoff here found the work ready: the run's own last verdict says so, and HANDOFF.md was
	 * committed since it started. Null when this app did not start one on this branch (it was restarted since). A verdict
	 * is kept on the work's record (`recordHandoff`), with the commit it was ready at, so it outlives this run and this
	 * machine: what the Hand off dialog offers later, while the branch is still there.
	 */
	handle('handoffResult', [checkout], async (workIn): Promise<boolean | null> => {
		const { canonical, recordsRoot } = workIn;
		const started = handoffStarts.get(canonical);
		const here = await readCheckout(canonical);
		const recent = agent.recentLines();
		if (!started || started.branch !== here.branch || recent.work !== here.branch) return null;
		const committed = await changedSince(canonical, started.head, HANDOFF_FILE);
		const ready = committed && lastVerdict(recent.lines) === 'ready';
		recordHandoff(recordsRoot, started.projectId, ready ? await headCommit(canonical) : null);
		return ready;
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
			const label = workLabel({ name });
			// The branch first: nothing is written for the agent if the work cannot start (a dirty tree, work not found).
			// Work already started, here or recorded, is continued where it is; it is not started a second time.
			const { branch, started: continuing } = await codebase.of(workIn, projectId);
			if (continuing) await codebase.resume(workIn, projectId, branch);
			else await codebase.start(workIn, projectId, `From ${label} of the prototype`, from ?? undefined);
			writeFileSync(pageFile, html);
			if (source !== null) writeFileSync(sourceFile, source);
			const taskFile = join(dirname(pageFile), `${name}-into-code.md`);
			writeFileSync(
				taskFile,
				buildInCodebaseTask(
					{
						skill,
						routeSkill: await readSkillText(ROUTE_SKILL),
						pageFile,
						sourceFile: source !== null ? sourceFile : null,
						auditFile: join(recordsRoot, projectId, `audit-${name}.md`),
						recordFile: recordPath(recordsRoot, projectId),
						name,
						basedOn: (await work.record(projectId, name))?.basedOn,
					},
					// Built toward the product's target from the start, with what the prototype's check left open: its page
					// checked now when it was not already. A check that cannot run leaves the findings out, never the move.
					(await checkoutParts(canonical, projectId, await prototypeAccessibility(projectId, name).catch(() => null))).parts,
				),
			);
			const prompt = buildInCodebasePrompt({ label, projectId, taskFile, continuing: continuing ? branch : null });
			return handToClaude(ports, canonical, prompt);
		},
	);
};
