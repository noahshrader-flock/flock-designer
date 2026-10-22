import type { CallsDeps, CheckedCheckout } from '../compose';
import { existsSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import type { AccessibilityResult, BranchAgainstBase, Handed, BuildInCodebasePlan, HandoffResult } from '../../shared/contract';
import { statesOf } from '../../shared/prototypeStates';
import { handoffReady, handoffVerdict } from '../../shared/handoff';
import { DESIGN_MODE_COMMAND, HANDOFF_COMMAND, LIGHT_CHECK_COMMAND, againstBaseWords, routeIn, workLabel } from '../../shared/work';
import { A11Y_COMMAND, productTarget, taskAccessibility } from '../services/accessibility/accessibilityBrief';
import { accessibilityOf } from '../services/accessibility/accessibilityCheck';
import { type CheckoutParts, guidePart, handoffTask, buildInCodebaseTask, updateBranchTask } from '../services/agent/agentTasks';
import { againstBase } from '../services/codebase/againstBase';
import { sharedCheckoutNote, unfinishedWork } from '../services/codebase/checkoutClean';
import { readDescriptor } from '../services/projects/descriptor';
import { handTask } from '../services/agent/handOver';
import { HANDOFF_FILE, HANDOFF_SKILL, commandLine, leftAlone } from '../services/codebase/engineeringHandoff';
import { branchTip, changedFiles, changedSince, fileAt, git, headCommit, readCheckout, remoteTip } from '../services/platform/git';
import { continueWork, recordHandoff, recordPath, recordPreview, recordedWork } from '../services/projects/workRecords';
import { GUIDE, MOVE_SKILL, ROUTE_SKILL, buildInCodebaseLead } from '../services/prototypes/prototype';
import { pullRequestText } from '../services/codebase/share';

/** What acts on codebase work in the checkout itself is refused off its branch, saying `why`. */
const onTheBranch = async (canonical: string, branch: string, why: string): Promise<void> => {
	if ((await readCheckout(canonical)).branch !== branch) throw new Error(`Open ${branch} first: ${why}.${await sharedCheckoutNote(canonical)}`);
};

export const codebaseArea = (d: CallsDeps) => {
	const {
		agent,
		agentShown,
		chooseAgentNow,
		designSystemOf,
		recordsRootOf,
		checkout,
		codebase,
		ports,
		prototypePage,
		publisher,
		readSkillText,
		servePrototype,
		runtime,
		share,
		signedInLogin,
		work,
		written,
	} = d;
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
		const records = recordsRootOf(canonical);
		return records === null ? null : dirname(records);
	};
	/** Named in the task, since a folder the agent has not been told about is one it never opens. */
	const sharedGuidance = async (canonical: string): Promise<string> => {
		const root = sharedRoot(canonical);
		const designSystem = await designSystemOf(canonical);
		const named: Array<[string, string | null]> = [
			["Shared agents (the product's shims point here)", root === null ? null : join(root, 'agents')],
			['Shared skills (a `skills/…` path in any guidance is here)', root === null ? null : join(root, 'skills')],
			['Shared standards', root === null ? null : join(root, 'standards')],
			['The knowledge base (how DSNR works, and how a product logs what went wrong)', root === null ? null : join(root, 'knowledge')],
			["The design system's checkout (its guidance and source)", designSystem],
		];
		const found = named.filter((n): n is [string, string] => n[1] !== null && existsSync(n[1]));
		return found.length ? ['## Also yours to read (never change)', '', ...found.map(([what, dir]) => `- ${what}: \`${dir}\``)].join('\n') : '';
	};
	/** `findings`: what a prototype's own accessibility check left open, to fix. */
	const checkoutParts = async (canonical: string, projectId: string, findings?: Parameters<typeof taskAccessibility>[2]): Promise<CheckoutParts> => ({
		guide: guidePart(await readSkillText(GUIDE), sharedRoot(canonical)),
		lightCheck: commandLine(readDescriptor(canonical).commands, LIGHT_CHECK_COMMAND, projectId),
		shared: await sharedGuidance(canonical),
		accessibility: await codebaseAccessibility(canonical, findings),
		voice: await work.voice(canonical),
	});
	/** Where each handoff handed over here started, so its result is read from what changed since. */
	const handoffs = new Map<string, { head: string; remote: string | null; branch: string }>();
	const handoffKey = (canonical: string, projectId: string) => `${canonical}\n${projectId}`;
	return {
		checkout,
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
		chooseAgent: chooseAgentNow,
		agentShown,
		handOff: async (workIn: CheckedCheckout, projectId: string): Promise<Handed> => {
			const { canonical, recordsRoot, descriptor } = workIn;
			const codebaseRecord = await recordedWork(canonical, recordsRoot, descriptor, projectId, 'codebase');
			const { branch } = codebaseRecord;
			await onTheBranch(canonical, branch, 'a handoff checks the work where it is');
			const skill = await readSkillText(HANDOFF_SKILL);
			const parts = await checkoutParts(canonical, projectId);
			const missingRoute = codebaseRecord.route ? null : { skill: await readSkillText(ROUTE_SKILL), recordFile: recordPath(recordsRoot, projectId) };
			const against = await againstBase(canonical, branch);
			const task = handoffTask(
				{
					skill,
					projectId,
					branch,
					gate: commandLine(descriptor.commands, HANDOFF_COMMAND, projectId),
					missingRoute,
					mergeState: against && againstBaseWords(against),
				},
				parts,
			);
			const { handed } = await handTask(ports, await agent(), async () => {
				handoffs.set(handoffKey(canonical, projectId), { head: await headCommit(canonical), remote: await remoteTip(canonical, branch), branch });
				return {
					root: canonical,
					what: `Hand ${projectId} to engineering, on ${branch}.`,
					taskFile: join(work.dir(projectId), 'codebase-handoff.md'),
					task,
				};
			});
			return handed;
		},
		/** How the work's branch stands against the product's default branch; null when that cannot be told here. */
		codebaseAgainstBase: async (workIn: CheckedCheckout, projectId: string): Promise<BranchAgainstBase | null> => {
			const { canonical, recordsRoot, descriptor } = workIn;
			const { branch } = await recordedWork(canonical, recordsRoot, descriptor, projectId, 'codebase');
			return againstBase(canonical, branch);
		},
		/**
		 * Update this branch: handed to the agent, which merges in the person's window, as every hand-off is. Only on the
		 * branch, with nothing unfinished; DSNR never merges, and keeps the tip it starts from first, so undoing it is one
		 * command.
		 */
		handCodebaseUpdate: async (workIn: CheckedCheckout, projectId: string): Promise<Handed> => {
			const { canonical, recordsRoot, descriptor } = workIn;
			const { branch } = await recordedWork(canonical, recordsRoot, descriptor, projectId, 'codebase');
			await onTheBranch(canonical, branch, 'it is brought up to date where it is');
			const unfinished = await unfinishedWork(canonical, basename(canonical));
			if (unfinished !== null) throw new Error(unfinished);
			const against = await againstBase(canonical, branch);
			if (against === null)
				throw new Error(`How ${branch} stands against the product's default branch cannot be told here, so nothing was handed over.`);
			if (against.behind === 0) throw new Error(`${branch} is already up to date with ${against.base}.`);
			const checkpoint = `refs/dsnr/checkpoint/${projectId}`;
			const parts = await checkoutParts(canonical, projectId);
			const { handed } = await handTask(ports, await agent(), async () => {
				await git(canonical, ['update-ref', checkpoint, await headCommit(canonical)]);
				return {
					root: canonical,
					what: `Bring ${branch} up to date with ${against.base}.`,
					taskFile: join(work.dir(projectId), 'codebase-update.md'),
					task: updateBranchTask({ against, checkpoint }, parts),
				};
			});
			return handed;
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
			recordHandoff(recordsRoot, projectId, handoffReady({ verdict, pushed }) ? await headCommit(canonical) : null);
			return { state: 'done', verdict, pushed, outside };
		},
		/** `uncommitted`: the checkout had changes nobody committed, and no agent made them here. */
		runLocally: async (workIn: CheckedCheckout, projectId: string, name: string): Promise<{ url: string; uncommitted: boolean }> => {
			const { canonical, recordsRoot, descriptor } = workIn;
			const record = await recordedWork(canonical, recordsRoot, descriptor, projectId, name);
			if ((await readCheckout(canonical)).branch !== record.branch) {
				written(await continueWork(canonical, recordsRoot, projectId, name, signedInLogin(), descriptor));
			}
			const uncommitted = !(await readCheckout(canonical)).clean;
			const result = await runtime.start(canonical, descriptor, DESIGN_MODE_COMMAND, projectId);
			if (result.state === 'running') return { url: routeIn(result.url, record.route), uncommitted };
			// `stopped` here means the process ended before it ever answered; its output is what was said.
			throw new Error(result.state === 'failed' ? result.detail : 'The preview stopped before it was ready. Its output is above.');
		},
		buildInCodebase: async (workIn: CheckedCheckout, projectId: string, name: string, from: string | null): Promise<Handed> => {
			const { canonical, recordsRoot } = workIn;
			const skill = await readSkillText(MOVE_SKILL);
			const html = await prototypePage(projectId, name);
			if (html === null) throw new Error('This prototype has no page yet.');
			const pageFile = work.file(projectId, name);
			const sourceFile = work.sourceFile(projectId, name);
			const source = await work.sourceText(projectId, name);
			const label = workLabel({ name });
			const { handed } = await handTask(ports, await agent(), async () => {
				// The branch first: nothing is written for the agent if the work cannot start (a dirty tree, work not found).
				const { branch, started: continuing } = await codebase.of(workIn, projectId);
				if (continuing) await codebase.resume(workIn, projectId, branch);
				else await codebase.start(workIn, projectId, `From ${label} of the prototype`, from ?? undefined);
				writeFileSync(pageFile, html);
				if (source !== null) writeFileSync(sourceFile, source);
				const task = buildInCodebaseTask(
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
					await checkoutParts(canonical, projectId, await prototypeAccessibility(projectId, name).catch(() => null)),
				);
				const what = buildInCodebaseLead({ label, projectId, continuing: continuing ? branch : null });
				return { root: canonical, what, taskFile: join(dirname(pageFile), `${name}-into-code.md`), task };
			});
			return handed;
		},
	};
};

export type CodebaseArea = ReturnType<typeof codebaseArea>;
