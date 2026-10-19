import type { CallsDeps, CheckedCheckout } from '../compose';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import type { AccessibilityResult, BuildInCodebase, BuildInCodebasePlan, HandoffResult } from '../../shared/contract';
import { statesOf } from '../../shared/prototypeStates';
import { handoffVerdict } from '../../shared/handoff';
import { DESIGN_MODE_COMMAND, routeIn, workLabel } from '../../shared/work';
import { A11Y_COMMAND, productTarget, taskAccessibility } from '../services/accessibility/accessibilityBrief';
import { accessibilityOf } from '../services/accessibility/accessibilityCheck';
import { afterRun, agentReadiness } from '../services/agent/agent';
import { type CheckoutParts, guidePart, handoffTask, buildInCodebaseTask } from '../services/agent/agentTasks';
import { designSystemCheckout, readDescriptor } from '../services/projects/descriptor';
import { recordsRootFor } from '../services/projects/discovery';
import { handToClaude } from '../services/agent/editor';
import { HANDOFF_FILE, HANDOFF_SKILL, commandLine, handoffPrompt, leftAlone } from '../services/codebase/engineeringHandoff';
import { branchTip, changedFiles, changedSince, fileAt, headCommit, readCheckout, remoteTip } from '../services/platform/git';
import { continueWork, recordHandoff, recordPath, recordPreview, recordedWork } from '../services/projects/workRecords';
import { GUIDE, MOVE_SKILL, ROUTE_SKILL, buildInCodebasePrompt } from '../services/prototypes/prototype';
import { pullRequestText } from '../services/codebase/share';

export const codebaseArea = (d: CallsDeps) => {
	const { agent, checkout, codebase, ports, prototypePage, publisher, readSkillText, servePrototype, runtime, share, signedInLogin, work, written } =
		d;
	const prototypeAccessibility = async (projectId: string, name: string): Promise<AccessibilityResult> => {
		const html = await prototypePage(projectId, name);
		if (html === null) throw new Error('This prototype has no page yet.');
		const url = await servePrototype(projectId, name, html);
		return accessibilityOf({
			file: work.checkFile(projectId, name),
			html,
			url,
			states: statesOf(html),
			target: await work.target(projectId, name),
			check: ports.headless.scan,
		});
	};
	const codebaseAccessibility = (canonical: string, findings?: Parameters<typeof taskAccessibility>[2]): Promise<string> => {
		const descriptor = readDescriptor(canonical);
		const check = commandLine(descriptor.commands, A11Y_COMMAND, '');
		return taskAccessibility(readSkillText, productTarget(join(canonical, descriptor.contextDir), descriptor.product), findings, check);
	};
	const sharedRoot = (canonical: string): string | null => {
		const records = recordsRootFor(canonical);
		return records === null ? null : dirname(records);
	};
	/** Named in the task, since a folder the agent has not been told about is one it never opens. */
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
	/** `findings`: what a prototype's own accessibility check left open, to fix. */
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
				voice: await work.voice(canonical),
			},
		};
	};
	/** Where each handoff handed over here started, so its result is read from what changed since. */
	const handoffs = new Map<string, { head: string; remote: string | null; branch: string }>();
	const handoffKey = (canonical: string, projectId: string) => `${canonical}\n${projectId}`;
	/** A run that says it finished but left changes uncommitted did not finish: anything shown from it would be half of it. */
	const committedAll = async (canonical: string): Promise<void> => {
		if (!(await readCheckout(canonical)).clean)
			throw new Error(
				'The agent stopped before it committed all of its work: there are changes in the checkout it did not commit. Continue in Claude Code to finish them.',
			);
	};
	return {
		checkout,
		agentStatus: () => agent.status(),
		stopAgent: async () => {
			await agent.stop();
			return null;
		},
		agentReadiness: () => agentReadiness(),
		// The branch comes from this person's own record, never from the window. Starts and returns: it takes minutes.
		shareWork: async (workIn: CheckedCheckout, projectId: string, name: string) => {
			const { canonical, descriptor, recordsRoot } = workIn;
			const { share: how } = descriptor;
			if (!how) {
				throw new Error(`${descriptor.product} does not say how a shared preview is built, so it cannot be shared from here.`);
			}
			const codebaseRecord = await recordedWork(canonical, recordsRoot, descriptor, projectId, name);
			const here = await readCheckout(canonical);
			if (here.branch === codebaseRecord.branch && !here.clean) {
				throw new Error(
					`There are uncommitted changes on ${codebaseRecord.branch}, and only committed work is shared. Commit them, then share again.`,
				);
			}
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
				// Published before the link is called ready: a reviewer cannot open what is not up yet.
				record: async (url, prUrl) => {
					recordPreview(recordsRoot, projectId, name, url, shared, prUrl);
					await publisher.publish(true);
				},
			});
		},
		buildInCodebasePlan: async (workIn: CheckedCheckout, projectId: string, name: string): Promise<BuildInCodebasePlan> => {
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
		},
		handOff: async (workIn: CheckedCheckout, projectId: string): Promise<BuildInCodebase> => {
			const { canonical, recordsRoot, descriptor } = workIn;
			const codebaseRecord = await recordedWork(canonical, recordsRoot, descriptor, projectId, 'codebase');
			const { branch } = codebaseRecord;
			if ((await readCheckout(canonical)).branch !== branch) throw new Error(`Open ${branch} first: a handoff checks the work where it is.`);
			const skill = await readSkillText(HANDOFF_SKILL);
			const { parts } = await checkoutParts(canonical, projectId);
			const missingRoute = codebaseRecord.route ? null : { skill: await readSkillText(ROUTE_SKILL), recordFile: recordPath(recordsRoot, projectId) };
			const task = handoffTask({ skill, projectId, branch, gate: commandLine(descriptor.commands, 'handoff', projectId), missingRoute }, parts);
			const taskFile = join(work.dir(projectId), 'handoff-task.md');
			mkdirSync(dirname(taskFile), { recursive: true });
			writeFileSync(taskFile, task);
			handoffs.set(handoffKey(canonical, projectId), { head: await headCommit(canonical), remote: await remoteTip(canonical, branch), branch });
			return handToClaude(ports, canonical, handoffPrompt({ projectId, branch, taskFile }));
		},
		/** Done once HANDOFF.md is committed since it was handed over and nothing is left uncommitted: the agent's work is in. */
		handoffResult: async (workIn: CheckedCheckout, projectId: string): Promise<HandoffResult> => {
			const { canonical, recordsRoot } = workIn;
			const key = handoffKey(canonical, projectId);
			const started = handoffs.get(key);
			if (!started) return { state: 'none' };
			if (!(await changedSince(canonical, started.head, HANDOFF_FILE)) || !(await readCheckout(canonical)).clean) return { state: 'waiting' };
			handoffs.delete(key);
			const verdict = handoffVerdict((await fileAt(canonical, 'HEAD', HANDOFF_FILE))?.text ?? '');
			const pushed = (await remoteTip(canonical, started.branch)) !== started.remote;
			const outside = (await changedFiles(canonical, started.head)).filter(leftAlone);
			recordHandoff(recordsRoot, projectId, verdict === 'ready' && !pushed ? await headCommit(canonical) : null);
			return { state: 'done', verdict, pushed, outside };
		},
		/** `uncommitted`: the checkout had changes nobody committed, and no agent made them here. */
		runLocally: async (workIn: CheckedCheckout, projectId: string, name: string): Promise<{ url: string; uncommitted: boolean }> => {
			const { canonical, recordsRoot, descriptor } = workIn;
			const record = await recordedWork(canonical, recordsRoot, descriptor, projectId, name);
			if ((await readCheckout(canonical)).branch !== record.branch) {
				codebase.assertAgentNotHere(canonical);
				written(await continueWork(canonical, recordsRoot, projectId, name, signedInLogin(), descriptor));
			}
			const going = agent.ended(record.branch);
			if (going) {
				if (afterRun(await going) === 'finished') await committedAll(canonical);
			}
			const uncommitted = going === null && !(await readCheckout(canonical)).clean;
			const result = await runtime.start(canonical, descriptor, DESIGN_MODE_COMMAND, projectId);
			if (result.state === 'running') return { url: routeIn(result.url, record.route), uncommitted };
			// `stopped` here means the process ended before it ever answered; its output is what was said.
			throw new Error(result.state === 'failed' ? result.detail : 'The preview stopped before it was ready. Its output is above.');
		},
		buildInCodebase: async (workIn: CheckedCheckout, projectId: string, name: string, from: string | null): Promise<BuildInCodebase> => {
			const { canonical, recordsRoot } = workIn;
			const skill = await readSkillText(MOVE_SKILL);
			const html = await prototypePage(projectId, name);
			if (html === null) throw new Error('This prototype has no page yet.');
			const pageFile = work.file(projectId, name);
			const sourceFile = work.sourceFile(projectId, name);
			const source = await work.sourceText(projectId, name);
			const label = workLabel({ name });
			// The branch first: nothing is written for the agent if the work cannot start (a dirty tree, work not found).
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
					// A check that cannot run leaves the findings out, never the move.
					(await checkoutParts(canonical, projectId, await prototypeAccessibility(projectId, name).catch(() => null))).parts,
				),
			);
			const prompt = buildInCodebasePrompt({ label, projectId, taskFile, continuing: continuing ? branch : null });
			return handToClaude(ports, canonical, prompt);
		},
	};
};

export type CodebaseArea = ReturnType<typeof codebaseArea>;
