import { folderName } from '../../shared/brief';
import type { OpenedPrototype, PrototypeAddressed } from '../../shared/contract';
import { coverPath, prototypeKey, prototypePagePath } from '../../shared/designPaths';
import { statesOf } from '../../shared/prototypeStates';
import { arg, handle } from '../handle';
import { fixRequest } from '../services/accessibilityBrief';
import { ADDRESS_SKILL, chooseComment } from '../services/address';
import { prototypeAddressTask, prototypeBuildTask } from '../services/agentTasks';
import { writeCommentsExport } from '../services/commentsExport';
import { ensureLocalBranch } from '../services/git';
import { jpegDataUrl } from '../services/picture';
import { builtHere, ensureCovers } from '../services/projectCovers';
import { BUILD_SKILL, assignFolder } from '../services/prototype';
import { whereTheChangeGoes } from '../services/prototypeWork';
import { existsSync } from 'node:fs';
import type { IpcDeps } from '../ipc';

/**
 * Prototypes: making one, building it, changing it for a comment, saving, opening, checking and picturing it.
 */
export const registerPrototypes = (d: IpcDeps): void => {
	const {
		agent,
		agentBusy,
		coverDeps,
		coversRead,
		designRepo,
		finishPrototypeChange,
		finishPrototypeChanges,
		me,
		once,
		opened,
		prototypeAccessibility,
		prototypeChanges,
		prototypePage,
		prototypeReadiness,
		prototypeRun,
		prototypesRoot,
		publishInBackground,
		readDesignBytes,
		readSkillText,
		recordStore,
		refuseWhileBusy,
		servePrototype,
		startPrototypeAgent,
		work,
	} = d;

	handle('prototypeReadiness', [arg.root], (root) => prototypeReadiness(root));
	handle('createPrototype', [arg.projectId, arg.name, arg.words, arg.startingPoint, arg.unknown], async (projectId, title, note, from, folder) => {
		// What it is modeled on is not optional: a prototype is built from a repository's real design system.
		if (!from) throw new Error('A prototype is modeled on a branch of a repository on this machine. Choose one.');
		// Only a repository this person accepted, and a branch in it, made local when it is only on GitHub.
		const root = opened.require(from.root);
		await ensureLocalBranch(root, from.branch);
		return work.start(root, { projectId, title, note, branch: from.branch, me: me(), folder: folderName(folder) });
	});
	handle('assignFolder', [arg.projectId, arg.unknown], async (projectId, folder) => {
		await assignFolder(recordStore(), projectId, folderName(folder));
		return null;
	});
	handle('buildPrototype', [arg.projectId, arg.prototypeName, arg.words], async (projectId, name, request) => {
		// The screen can ask twice (it is opened twice in development, and Try again asks again): the runner joins
		// this prototype's run, and refuses while it is working on anything else.
		const skill = await readSkillText(BUILD_SKILL);
		const { build, sources } = await prototypeRun(projectId, name);
		const accessibility = await work.accessibility(projectId, name);
		const voice = await work.voice();
		return startPrototypeAgent(
			projectId,
			name,
			sources,
			prototypeBuildTask({ skill, build, sources, accessibility, voice, request: String(request) }),
		);
	});
	handle('addressPrototype', [arg.projectId, arg.prototypeName, arg.commentId], async (projectId, name, commentId) => {
		refuseWhileBusy();
		// One left from a run whose screen was closed is finished first, or this run would start from the same copy.
		await finishPrototypeChanges(projectId);
		const addressSkill = await readSkillText(ADDRESS_SKILL);
		const buildSkill = await readSkillText(BUILD_SKILL);
		// Read now, not earlier: this is what makes the file current, and what says who has commented.
		const comments = await designRepo.readComments(prototypeKey(projectId, name));
		const exported = writeCommentsExport(prototypesRoot, {
			projectId,
			title: await work.title(projectId),
			iteration: { name, branch: prototypeKey(projectId, name) },
			comments,
			generatedAt: new Date(),
		});
		const number = chooseComment(comments, commentId);
		const change = await work.startChange(projectId, name, async (it) =>
			(it.name === name ? comments : await designRepo.readComments(it.branch)).map((c) => c.author),
		);
		// Modeled on what the iteration it comes from was: a new one has no record of its own yet.
		const { build, sources } = await prototypeRun(projectId, change.target, change.from.name);
		prototypeChanges.set(commentId, { projectId, change });
		const where = whereTheChangeGoes(change, name);
		const accessibility = await work.accessibility(projectId, change.from.name);
		const voice = await work.voice();
		return startPrototypeAgent(
			projectId,
			name,
			sources,
			prototypeAddressTask({ addressSkill, buildSkill, build, sources, accessibility, voice, commentsPath: exported.path, number, name, where }),
		);
	});
	handle('finishPrototypeAddress', [arg.commentId], (commentId): Promise<PrototypeAddressed> => finishPrototypeChange(commentId));
	handle('savePrototype', [arg.projectId, arg.iterationName], async (projectId, name): Promise<null> => {
		await work.save(projectId, name);
		publishInBackground(projectId, name);
		return null;
	});
	handle('openPrototype', [arg.projectId, arg.prototypeName], async (projectId, name): Promise<OpenedPrototype> => {
		await finishPrototypeChanges(projectId);
		const html = await prototypePage(projectId, name);
		if (html === null) throw new Error('This prototype has no page yet.');
		// A page built here but never saved (the screen was left, or gave up, while the agent finished) is saved
		// now: what this machine shows is what reviewers get, and no finished page is stranded on one machine.
		const local = work.file(projectId, name);
		const path = prototypePagePath(projectId, name);
		if (existsSync(local) && agent.status().state !== 'running' && (await recordStore().read(path)) !== html) await work.keep(projectId, name, html);
		return { url: await servePrototype(projectId, name, html), states: statesOf(html) };
	});
	handle('checkAccessibility', [arg.projectId, arg.iterationName], (projectId, name) =>
		once(`accessibility:${projectId}/${name}`, () => prototypeAccessibility(projectId, name)),
	);
	handle('ensureCovers', [], () => once('covers', async () => (agentBusy() ? [] : ensureCovers(coverDeps, builtHere(prototypesRoot)))));
	handle('projectCover', [arg.projectId, arg.prototypeName, arg.name], async (projectId, name, cover): Promise<string | null> => {
		const path = coverPath(projectId, name, cover);
		const kept = coversRead.get(path);
		if (kept !== undefined) return kept;
		const bytes = await readDesignBytes(path);
		if (bytes === null) return null;
		const url = jpegDataUrl(bytes);
		coversRead.set(path, url);
		return url;
	});
	// One round of the prototype's own check: its agent given what the check found, as a build error is given (T7).
	handle('fixAccessibility', [arg.projectId, arg.iterationName], async (projectId, name) => {
		refuseWhileBusy();
		const result = await prototypeAccessibility(projectId, name);
		if (result.violations.length === 0) throw new Error('The accessibility check found nothing to fix.');
		const skill = await readSkillText(BUILD_SKILL);
		const { build, sources } = await prototypeRun(projectId, name);
		const accessibility = await work.accessibility(projectId, name);
		const voice = await work.voice();
		return startPrototypeAgent(
			projectId,
			name,
			sources,
			prototypeBuildTask({ skill, build, sources, accessibility, voice, request: fixRequest(result) }),
		);
	});
};
