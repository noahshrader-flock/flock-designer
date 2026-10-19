import type { CallsDeps } from '../compose';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { folderName } from '../../shared/brief';
import type { BuildInCodebase, CommentRef, JobEnd, OpenedPrototype, PrototypeAddressed, PrototypeReadiness } from '../../shared/contract';
import { coverPath, prototypeKey, prototypePagePath } from '../../shared/designPaths';
import { statesOf } from '../../shared/prototypeStates';
import { workLabel } from '../../shared/work';
import { ADDRESS_SKILL, chooseComment } from '../services/prototypes/address';
import { afterRun } from '../services/agent/agent';
import { guidePart, prototypeAddressTask, prototypeBuildTask } from '../services/agent/agentTasks';
import { writeCommentsExport } from '../services/prototypes/commentsExport';
import { readDescriptor } from '../services/projects/descriptor';
import { handToClaude } from '../services/agent/editor';
import { ensureLocalBranch } from '../services/platform/git';
import { INSTALL_COMMAND } from '../services/codebase/install';
import { jpegDataUrl } from '../services/prototypes/picture';
import { type CoverDeps, builtHere, ensureCovers } from '../services/prototypes/projectCovers';
import { BUILD_SKILL, GUIDE, type PrototypeSources, assignFolder, prototypeBuildPrompt, prototypeReadable } from '../services/prototypes/prototype';
import { type PrototypeChange, localPrototypeFile, whereTheChangeGoes } from '../services/prototypes/prototypeWork';
import { singleFlight } from '../services/platform/concurrency';

export const prototypesArea = (d: CallsDeps) => {
	const {
		agent,
		agentBusy,
		designRepo,
		me,
		opened,
		ports,
		prototypePage,
		prototypesRoot,
		deploys,
		readSkillText,
		refuseWhileBusy,
		servePrototype,
		store,
		work,
	} = d;
	const inFlight = singleFlight<string, unknown>();
	const once = <T>(key: string, run: () => Promise<T>): Promise<T> => inFlight.run(key, run) as Promise<T>;
	const coverDeps: CoverDeps = {
		store: store.records,
		page: (projectId, name) => {
			const file = localPrototypeFile(prototypesRoot, projectId, name, 'html');
			return existsSync(file) ? readFileSync(file, 'utf8') : null;
		},
		serve: servePrototype,
		draw: ports.headless.draw,
		tried: new Set(),
	};
	const prototypeRun = async (projectId: string, name: string, modeledOn = name) =>
		work.buildPlan(projectId, name, await once(`source:${projectId}`, () => work.sources(projectId, modeledOn)));
	const guideFor = async (sources: PrototypeSources): Promise<string> =>
		guidePart(await readSkillText(GUIDE), sources.sharedStandards === null ? null : dirname(sources.sharedStandards));
	const buildTask = async (projectId: string, name: string, request: string): Promise<{ task: string; sources: PrototypeSources }> => {
		const skill = await readSkillText(BUILD_SKILL);
		const { build, sources } = await prototypeRun(projectId, name);
		const accessibility = await work.accessibility(projectId, name);
		const voice = await work.voice();
		return { task: prototypeBuildTask({ guide: await guideFor(sources), skill, build, sources, accessibility, voice, request }), sources };
	};
	const runPrototypeAgent = (projectId: string, name: string, sources: PrototypeSources, task: string) =>
		agent.run(work.dir(projectId), projectId, task, { bare: true, readOnly: prototypeReadable(sources), work: prototypeKey(projectId, name) });
	const prototypeChanges = new Map<string, { comment: CommentRef; projectId: string; change: PrototypeChange }>();
	const keyOf = (comment: CommentRef) => `${comment.thread}/${comment.id}`;
	/** Run when the agent ends, and when the prototype is opened again, so a change whose run was stopped is never stranded. */
	const finishPrototypeChange = async (comment: CommentRef): Promise<PrototypeAddressed> => {
		const pending = prototypeChanges.get(keyOf(comment));
		if (!pending) throw new Error('There is no change to this comment waiting to be saved.');
		refuseWhileBusy();
		prototypeChanges.delete(keyOf(comment));
		const { projectId, change } = pending;
		const { version, made } = await work.finishChange(projectId, change, me(), `For a comment on ${workLabel(change.from)}`);
		// Either way: a run that changed nothing clears the mark an earlier one left.
		const marked = await designRepo.threads.setAddressed(comment, version, version === null ? null : change.target);
		if (version !== null) deploys.page(projectId, change.target);
		return { changed: version !== null, version: change.target, made, comment: marked };
	};
	const finishPrototypeChanges = async (projectId: string): Promise<void> => {
		if (agentBusy()) return;
		for (const pending of [...prototypeChanges.values()]) {
			// One that does not build is left as it is on this machine, unrecorded: nobody is watching to be told why, and
			// the next Address on it starts again from what people saw.
			if (pending.projectId === projectId) await finishPrototypeChange(pending.comment).catch(() => undefined);
		}
	};
	/** What is at a picture's path never changes, so it is read once. */
	const coversRead = new Map<string, string>();
	return {
		prototypeReadiness: (root: string): PrototypeReadiness => {
			const canonical = opened.require(root);
			const readiness = work.readiness(canonical);
			return readiness.ready ? readiness : { ...readiness, canInstall: readDescriptor(canonical).commands.some((c) => c.id === INSTALL_COMMAND) };
		},
		createPrototype: async (projectId: string, title: string, note: string, from: { root: string; branch: string } | null, folder: unknown) => {
			if (!from) throw new Error('A prototype is modeled on a branch of a repository on this machine. Choose one.');
			const root = opened.require(from.root);
			await ensureLocalBranch(root, from.branch);
			return work.start(root, { projectId, title, note, branch: from.branch, me: me(), folder: folderName(folder) });
		},
		assignFolder: async (projectId: string, folder: unknown) => {
			await assignFolder(store.records(), projectId, folderName(folder));
			return null;
		},
		handPrototypeBuild: async (root: string, projectId: string, name: string, request: string): Promise<BuildInCodebase> => {
			const canonical = opened.require(root);
			const { task } = await buildTask(projectId, name, request);
			const taskFile = join(dirname(work.file(projectId, name)), `${name}-build.md`);
			writeFileSync(taskFile, task);
			const label = workLabel({ name });
			return handToClaude(ports, canonical, prototypeBuildPrompt({ label, projectId, taskFile }));
		},
		addressPrototype: async (projectId: string, name: string, comment: CommentRef, newVersion: boolean): Promise<JobEnd<PrototypeAddressed>> => {
			refuseWhileBusy();
			// One left from a run whose screen was closed is finished first, or this run would start from the same copy.
			await finishPrototypeChanges(projectId);
			const addressSkill = await readSkillText(ADDRESS_SKILL);
			const buildSkill = await readSkillText(BUILD_SKILL);
			// Read now, not earlier: this is what makes the file current.
			const comments = await designRepo.threads.readComments(prototypeKey(projectId, name));
			const exported = writeCommentsExport(prototypesRoot, {
				projectId,
				title: await work.title(projectId),
				work: { name, branch: prototypeKey(projectId, name) },
				comments,
				generatedAt: new Date(),
			});
			const number = chooseComment(comments, comment);
			const change = await work.startChange(projectId, name, { newVersion, comments, acting: comment });
			// Modeled on what the version it comes from was: a new one has no record of its own yet.
			const { build, sources } = await prototypeRun(projectId, change.target, change.from.name);
			prototypeChanges.set(keyOf(comment), { comment, projectId, change });
			const where = whereTheChangeGoes(change);
			const accessibility = await work.accessibility(projectId, change.from.name);
			const voice = await work.voice();
			const end = await runPrototypeAgent(
				projectId,
				name,
				sources,
				prototypeAddressTask({
					guide: await guideFor(sources),
					addressSkill,
					buildSkill,
					build,
					sources,
					accessibility,
					voice,
					commentsPath: exported.path,
					number,
					name,
					where,
				}),
			);
			// Stopped, the change is finished the next time the prototype is opened, from what the agent left.
			if (afterRun(end) === 'stopped') return { state: 'stopped' };
			return { state: 'done', value: await finishPrototypeChange(comment) };
		},
		saveBuilt: async (projectId: string, name: string): Promise<'saved' | 'waiting'> => {
			const saved = await work.saveBuilt(projectId, name);
			if (saved === 'saved') deploys.page(projectId, name);
			return saved;
		},
		openPrototype: async (projectId: string, name: string): Promise<OpenedPrototype> => {
			await finishPrototypeChanges(projectId);
			const html = await prototypePage(projectId, name);
			if (html === null) throw new Error('This prototype has no page yet.');
			// A page built here but never saved (the screen was left while the agent finished) is saved now, so no
			// finished page is stranded on one machine.
			const local = work.file(projectId, name);
			const path = prototypePagePath(projectId, name);
			if (existsSync(local) && !agentBusy() && (await store.records().read(path)) !== html) {
				await work.keep(projectId, name, html);
				deploys.page(projectId, name);
			}
			return { url: await servePrototype(projectId, name, html), states: statesOf(html) };
		},
		ensureCovers: () => once('covers', async () => (agentBusy() ? [] : ensureCovers(coverDeps, builtHere(prototypesRoot)))),
		projectCover: async (projectId: string, name: string, cover: string): Promise<string | null> => {
			const path = coverPath(projectId, name, cover);
			const kept = coversRead.get(path);
			if (kept !== undefined) return kept;
			const bytes = await store.readBytes(path);
			if (bytes === null) return null;
			const url = jpegDataUrl(bytes);
			coversRead.set(path, url);
			return url;
		},
	};
};

export type PrototypesArea = ReturnType<typeof prototypesArea>;
