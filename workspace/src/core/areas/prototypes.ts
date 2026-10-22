import type { CallsDeps } from '../compose';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { folderName } from '../../shared/brief';
import type { Handed, CommentRef, HandedComment, OpenedPrototype } from '../../shared/contract';
import { coverPath, prototypeKey, prototypePagePath, workPath } from '../../shared/designPaths';
import { statesOf } from '../../shared/prototypeStates';
import { errorText } from '../../shared/result';
import { ISSUE } from '../../shared/vocabulary';
import { workLabel } from '../../shared/work';
import { ADDRESS_SKILL, chooseComment } from '../services/prototypes/address';
import { guidePart, prototypeAddressTask, prototypeBuildTask, refreshRequest } from '../services/agent/agentTasks';
import { writeCommentsExport } from '../services/prototypes/commentsExport';
import { handTask } from '../services/agent/handOver';
import { jpegDataUrl } from '../services/prototypes/picture';
import { type CoverDeps, builtHere, ensureCovers } from '../services/prototypes/projectCovers';
import {
	BUILD_SKILL,
	GUIDE,
	type PrototypeSources,
	assignFolder,
	deleteProject,
	renameProject,
	setBaseCommit,
} from '../services/prototypes/prototype';
import { localPrototypeFile, whereTheChangeGoes } from '../services/prototypes/prototypeWork';
import { dropAllPending } from '../services/prototypes/pendingPrototypes';
import { singleFlight } from '../services/platform/concurrency';

export const prototypesArea = (d: CallsDeps) => {
	const { agent, designRepos, emit, opened, ports, prototypePage, prototypesRoot, publisher, deploys, readSkillText, servePrototype, store, work } =
		d;
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
	/** What every prototype task carries. `modeledOn` is the version whose sources and target apply: a new one has no record yet. */
	const taskParts = async (projectId: string, name: string, modeledOn = name) => {
		const { build, sources } = await prototypeRun(projectId, name, modeledOn);
		return {
			guide: await guideFor(sources),
			build,
			sources,
			accessibility: await work.accessibility(projectId, modeledOn),
			voice: await work.voice(),
		};
	};
	/** What is at a picture's path never changes, so it is read once. */
	const coversRead = new Map<string, string>();
	return {
		prototypeBehind: (projectId: string, name: string) => work.behind(projectId, name),
		/**
		 * In place: the base moves first, so the task is built from the latest code, and moves back if nothing is handed
		 * over. Its comments stay on it, pinned where they were made.
		 */
		handPrototypeRefresh: async (root: string, projectId: string, name: string): Promise<Handed> => {
			const canonical = opened.require(root);
			const label = workLabel({ name });
			const now = await work.behind(projectId, name);
			if (now === null)
				throw new Error(`${label} cannot be brought up to date here: it is modeled on another product, or on code this clone does not have.`);
			if (now.behind === 0) throw new Error(`${label} is already modeled on the latest of ${now.branch}.`);
			let moved = false;
			try {
				const { handed } = await handTask(ports, await agent(), async () => {
					moved = await setBaseCommit(store.records(), projectId, name, now.latest);
					await work.startChange(projectId, name, { newVersion: false, comments: null });
					return {
						root: canonical,
						what: `Rebuild prototype ${label} of ${projectId} on the latest product code.`,
						taskFile: join(dirname(work.file(projectId, name)), `${name}-refresh.md`),
						task: prototypeBuildTask({
							...(await taskParts(projectId, name)),
							skill: await readSkillText(BUILD_SKILL),
							request: refreshRequest({
								label,
								branch: now.branch,
								was: now.commit,
								now: now.latest,
								newer: now.behind,
								source: work.sourceFile(projectId, name),
							}),
						}),
					};
				});
				return handed;
			} catch (err) {
				if (moved) await setBaseCommit(store.records(), projectId, name, now.commit).catch(() => undefined);
				throw err;
			}
		},
		assignFolder: async (projectId: string, folder: unknown) => {
			await assignFolder(store.records(), projectId, folderName(folder));
			return null;
		},
		/** The published site is built again, as its pages and index show the name. */
		renameProject: async (projectId: string, title: string) => {
			await renameProject(store.records(), projectId, title);
			deploys.site();
			return null;
		},
		/**
		 * Built again, the site has none of its pages; one only started here was never on it, and goes with its start. Answered
		 * once the deletion is published, so the list read next no longer has it.
		 */
		deleteProject: async (projectId: string, typed: string) => {
			const shared = await store.records().has(workPath(projectId));
			// Read before it goes: the review threads to close are its work's.
			const branches = (await work.records(projectId)).map((r) => r.branch);
			await deleteProject(store.records(), projectId, typed);
			await publisher.publish(true);
			dropAllPending(prototypesRoot, projectId);
			if (shared) deploys.site();
			emit('onProjectDeleted', projectId);
			// Its comments' threads are closed once it is gone, so none is left open for work that is not there.
			await designRepos
				.now()
				.threads.closeDeleted(projectId, branches)
				.catch((err: unknown) => {
					throw new Error(`${projectId} is deleted, but its review ${ISSUE}s on GitHub could not be closed: ${errorText(err)}`);
				});
			return null;
		},
		handPrototypeAddress: async (root: string, projectId: string, name: string, comment: CommentRef, newVersion: boolean): Promise<HandedComment> => {
			const canonical = opened.require(root);
			const { handed, prepared } = await handTask(ports, await agent(), async () => {
				const addressSkill = await readSkillText(ADDRESS_SKILL);
				const buildSkill = await readSkillText(BUILD_SKILL);
				// Read now, not earlier: this is what makes the file current.
				const comments = await designRepos.now().threads.readComments(prototypeKey(projectId, name));
				const exported = writeCommentsExport(prototypesRoot, {
					projectId,
					title: await work.title(projectId),
					work: { name, branch: prototypeKey(projectId, name) },
					comments,
					generatedAt: new Date(),
				});
				const number = chooseComment(comments, comment);
				const change = await work.startChange(projectId, name, { newVersion, comments, acting: comment });
				const task = prototypeAddressTask({
					...(await taskParts(projectId, change.target, change.from.name)),
					addressSkill,
					buildSkill,
					commentsPath: exported.path,
					number,
					name,
					where: whereTheChangeGoes(change),
				});
				return {
					root: canonical,
					what: `Address comment ${number} on prototype ${workLabel({ name })} of ${projectId}.`,
					taskFile: join(dirname(work.file(projectId, change.target)), `${change.target}-address.md`),
					task,
					change,
					number,
				};
			});
			const { change, number } = prepared;
			return { ...handed, target: change.target, from: change.fresh ? change.from.name : null, number };
		},
		saveBuilt: d.saveBuilt,
		openPrototype: async (projectId: string, name: string): Promise<OpenedPrototype> => {
			const html = await prototypePage(projectId, name);
			if (html === null) throw new Error('This prototype has no page yet.');
			// A page built here but never saved (the window that watched for it was closed) is saved now, so no finished page
			// is stranded on one machine.
			const local = work.file(projectId, name);
			const path = prototypePagePath(projectId, name);
			if (existsSync(local) && (await store.records().read(path)) !== html) {
				await work.keep(projectId, name, html);
				deploys.page(projectId, name);
			}
			return { url: await servePrototype(projectId, name, html), states: statesOf(html) };
		},
		ensureCovers: () => once('covers', () => ensureCovers(coverDeps, builtHere(prototypesRoot))),
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
