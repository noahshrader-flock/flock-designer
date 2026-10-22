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
import { type CoverDeps, builtHere, ensureCovers } from '../services/prototypes/prototypeCovers';
import {
	BUILD_SKILL,
	GUIDE,
	type PrototypeSources,
	assignFolder,
	deletePrototype,
	renamePrototype,
	setBaseCommit,
} from '../services/prototypes/prototype';
import { localPrototypeFile, whereTheChangeGoes } from '../services/prototypes/versionWork';
import { dropAllPending } from '../services/prototypes/pendingPrototypes';
import { singleFlight } from '../services/platform/concurrency';

export const prototypesArea = (d: CallsDeps) => {
	const { agent, designRepos, emit, opened, ports, prototypePage, prototypesRoot, publisher, deploys, readSkillText, servePrototype, store, work } =
		d;
	const inFlight = singleFlight<string, unknown>();
	const once = <T>(key: string, run: () => Promise<T>): Promise<T> => inFlight.run(key, run) as Promise<T>;
	const coverDeps: CoverDeps = {
		store: store.records,
		page: (prototypeId, name) => {
			const file = localPrototypeFile(prototypesRoot, prototypeId, name, 'html');
			return existsSync(file) ? readFileSync(file, 'utf8') : null;
		},
		serve: servePrototype,
		draw: ports.headless.draw,
		tried: new Set(),
	};
	const prototypeRun = async (prototypeId: string, name: string, modeledOn = name) =>
		work.buildPlan(prototypeId, name, await once(`source:${prototypeId}`, () => work.sources(prototypeId, modeledOn)));
	const guideFor = async (sources: PrototypeSources): Promise<string> =>
		guidePart(await readSkillText(GUIDE), sources.sharedStandards === null ? null : dirname(sources.sharedStandards));
	/** What every prototype task carries. `modeledOn` is the version whose sources and target apply: a new one has no record yet. */
	const taskParts = async (prototypeId: string, name: string, modeledOn = name) => {
		const { build, sources } = await prototypeRun(prototypeId, name, modeledOn);
		return {
			guide: await guideFor(sources),
			build,
			sources,
			accessibility: await work.accessibility(prototypeId, modeledOn),
			voice: await work.voice(),
		};
	};
	/** What is at a picture's path never changes, so it is read once. */
	const coversRead = new Map<string, string>();
	return {
		prototypeBehind: (prototypeId: string, name: string) => work.behind(prototypeId, name),
		/**
		 * In place: the base moves first, so the task is built from the latest code, and moves back if nothing is handed
		 * over. Its comments stay on it, pinned where they were made.
		 */
		handPrototypeRefresh: async (root: string, prototypeId: string, name: string): Promise<Handed> => {
			const canonical = opened.require(root);
			const label = workLabel({ name });
			const now = await work.behind(prototypeId, name);
			if (now === null)
				throw new Error(`${label} cannot be brought up to date here: it is modeled on another product, or on code this clone does not have.`);
			if (now.behind === 0) throw new Error(`${label} is already modeled on the latest of ${now.branch}.`);
			let moved = false;
			try {
				const { handed } = await handTask(ports, await agent(), async () => {
					moved = await setBaseCommit(store.records(), prototypeId, name, now.latest);
					await work.startChange(prototypeId, name, { newVersion: false, comments: null });
					return {
						root: canonical,
						what: `Rebuild prototype ${label} of ${prototypeId} on the latest product code.`,
						taskFile: join(dirname(work.file(prototypeId, name)), `${name}-refresh.md`),
						task: prototypeBuildTask({
							...(await taskParts(prototypeId, name)),
							skill: await readSkillText(BUILD_SKILL),
							request: refreshRequest({
								label,
								branch: now.branch,
								was: now.commit,
								now: now.latest,
								newer: now.behind,
								source: work.sourceFile(prototypeId, name),
							}),
						}),
					};
				});
				return handed;
			} catch (err) {
				if (moved) await setBaseCommit(store.records(), prototypeId, name, now.commit).catch(() => undefined);
				throw err;
			}
		},
		assignFolder: async (prototypeId: string, folder: unknown) => {
			await assignFolder(store.records(), prototypeId, folderName(folder));
			return null;
		},
		/** The published site is built again, as its pages and index show the name. */
		renamePrototype: async (prototypeId: string, title: string) => {
			await renamePrototype(store.records(), prototypeId, title);
			deploys.site();
			return null;
		},
		/**
		 * Built again, the site has none of its pages; one only started here was never on it, and goes with its start. Answered
		 * once the deletion is published, so the list read next no longer has it.
		 */
		deletePrototype: async (prototypeId: string, typed: string) => {
			const shared = await store.records().has(workPath(prototypeId));
			// Read before it goes: the review threads to close are its work's.
			const branches = (await work.records(prototypeId)).map((r) => r.branch);
			await deletePrototype(store.records(), prototypeId, typed);
			await publisher.publish(true);
			dropAllPending(prototypesRoot, prototypeId);
			if (shared) deploys.site();
			emit('onPrototypeDeleted', prototypeId);
			// Its comments' threads are closed once it is gone, so none is left open for work that is not there.
			await designRepos
				.now()
				.threads.closeDeleted(prototypeId, branches)
				.catch((err: unknown) => {
					throw new Error(`${prototypeId} is deleted, but its review ${ISSUE}s on GitHub could not be closed: ${errorText(err)}`);
				});
			return null;
		},
		handPrototypeAddress: async (
			root: string,
			prototypeId: string,
			name: string,
			comment: CommentRef,
			newVersion: boolean,
		): Promise<HandedComment> => {
			const canonical = opened.require(root);
			const { handed, prepared } = await handTask(ports, await agent(), async () => {
				const addressSkill = await readSkillText(ADDRESS_SKILL);
				const buildSkill = await readSkillText(BUILD_SKILL);
				// Read now, not earlier: this is what makes the file current.
				const comments = await designRepos.now().threads.readComments(prototypeKey(prototypeId, name));
				const exported = writeCommentsExport(prototypesRoot, {
					prototypeId,
					title: await work.title(prototypeId),
					work: { name, branch: prototypeKey(prototypeId, name) },
					comments,
					generatedAt: new Date(),
				});
				const number = chooseComment(comments, comment);
				const change = await work.startChange(prototypeId, name, { newVersion, comments, acting: comment });
				const task = prototypeAddressTask({
					...(await taskParts(prototypeId, change.target, change.from.name)),
					addressSkill,
					buildSkill,
					commentsPath: exported.path,
					number,
					name,
					where: whereTheChangeGoes(change),
				});
				return {
					root: canonical,
					what: `Address comment ${number} on prototype ${workLabel({ name })} of ${prototypeId}.`,
					taskFile: join(dirname(work.file(prototypeId, change.target)), `${change.target}-address.md`),
					task,
					change,
					number,
				};
			});
			const { change, number } = prepared;
			return { ...handed, target: change.target, from: change.fresh ? change.from.name : null, number };
		},
		saveBuilt: d.saveBuilt,
		openPrototype: async (prototypeId: string, name: string): Promise<OpenedPrototype> => {
			const html = await prototypePage(prototypeId, name);
			if (html === null) throw new Error('This prototype has no page yet.');
			// A page built here but never saved (the window that watched for it was closed) is saved now, so no finished page
			// is stranded on one machine.
			const local = work.file(prototypeId, name);
			const path = prototypePagePath(prototypeId, name);
			if (existsSync(local) && (await store.records().read(path)) !== html) {
				await work.keep(prototypeId, name, html);
				deploys.page(prototypeId, name);
			}
			return { url: await servePrototype(prototypeId, name, html), states: statesOf(html) };
		},
		ensureCovers: () => once('covers', () => ensureCovers(coverDeps, builtHere(prototypesRoot))),
		prototypeCover: async (prototypeId: string, name: string, cover: string): Promise<string | null> => {
			const path = coverPath(prototypeId, name, cover);
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
