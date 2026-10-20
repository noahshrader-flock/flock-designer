import type { CallsDeps } from '../compose';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { folderName } from '../../shared/brief';
import type { DesignSystemBuild, Handed, CommentRef, HandedComment, OpenedPrototype, PrototypeReadiness } from '../../shared/contract';
import { coverPath, prototypeKey, prototypePagePath } from '../../shared/designPaths';
import { statesOf } from '../../shared/prototypeStates';
import { workLabel } from '../../shared/work';
import { ADDRESS_SKILL, chooseComment } from '../services/prototypes/address';
import { guidePart, prototypeAddressTask, prototypeBuildTask, refreshRequest } from '../services/agent/agentTasks';
import { writeCommentsExport } from '../services/prototypes/commentsExport';
import { readDescriptor } from '../services/projects/descriptor';
import { handTask } from '../services/agent/handOver';
import { readCheckout } from '../services/platform/git';
import { warmTip } from '../services/platform/fetch';
import { INSTALL_COMMAND } from '../services/codebase/install';
import { jpegDataUrl } from '../services/prototypes/picture';
import { type CoverDeps, builtHere, ensureCovers } from '../services/prototypes/projectCovers';
import { BUILD_SKILL, GUIDE, type PrototypeSources, assignFolder, setBaseCommit, setDesignSystemFrom } from '../services/prototypes/prototype';
import { localPrototypeFile, whereTheChangeGoes } from '../services/prototypes/prototypeWork';
import { singleFlight } from '../services/platform/concurrency';

export const prototypesArea = (d: CallsDeps) => {
	const { agent, designRepo, me, opened, ports, prototypePage, prototypesRoot, deploys, readSkillText, servePrototype, store, work } = d;
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
		work.buildPlan(projectId, name, await once(`source:${projectId}`, () => work.sources(projectId, modeledOn)), modeledOn);
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
		prototypeReadiness: (root: string): PrototypeReadiness => {
			const canonical = opened.require(root);
			const readiness = work.readiness(canonical);
			return readiness.ready ? readiness : { ...readiness, canInstall: readDescriptor(canonical).commands.some((c) => c.id === INSTALL_COMMAND) };
		},
		createPrototype: async (projectId: string, title: string, note: string, from: { root: string; branch: string } | null, folder: unknown) => {
			if (!from) throw new Error('A prototype is modeled on a branch of a repository on this machine. Choose one.');
			// Nothing is made local: a branch only on origin is modeled on from there, as `freshTip` reads it.
			const root = opened.require(from.root);
			return work.start(root, { projectId, title, note, branch: from.branch, me: me(), folder: folderName(folder) });
		},
		warmPrototypeBase: async (root: string): Promise<null> => {
			const canonical = opened.require(root);
			const { branch } = await readCheckout(canonical);
			if (branch !== null) warmTip(canonical, branch);
			return null;
		},
		prototypeBehind: (projectId: string, name: string) => work.behind(projectId, name),
		prototypeDesignSystem: (projectId: string, name: string) => work.designSystemBuild(projectId, name),
		/**
		 * The choice is kept first and the page built from its saved source and saved, so the page is what it says it is built
		 * from; a build that fails puts the choice back, and says what the build said.
		 */
		setPrototypeDesignSystem: async (root: string, projectId: string, name: string, from: 'installed' | 'clone'): Promise<DesignSystemBuild> => {
			opened.require(root);
			const now = await work.designSystemBuild(projectId, name);
			if (now === null) throw new Error(`${projectId} has no ${workLabel({ name })} here to build.`);
			if (from === 'clone' && now.clone === null)
				throw new Error(`No clone of ${now.pkg} shown to be its source is here, so ${workLabel({ name })} cannot be built from one.`);
			if (now.from === from) return now;
			await setDesignSystemFrom(store.records(), projectId, name, from);
			try {
				// Its saved source, here, is what is built.
				await work.sourceHere(projectId, name);
				await work.buildPage(projectId, name);
				await work.keep(projectId, name, readFileSync(work.file(projectId, name), 'utf8'));
				deploys.page(projectId, name);
			} catch (err) {
				await setDesignSystemFrom(store.records(), projectId, name, now.from).catch(() => undefined);
				throw err;
			}
			return { ...now, from };
		},
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
		handPrototypeBuild: async (root: string, projectId: string, name: string, request: string): Promise<Handed> => {
			const canonical = opened.require(root);
			const { handed } = await handTask(ports, await agent(), async () => ({
				root: canonical,
				what: `Build prototype ${workLabel({ name })} of ${projectId}.`,
				taskFile: join(dirname(work.file(projectId, name)), `${name}-build.md`),
				task: prototypeBuildTask({ ...(await taskParts(projectId, name)), skill: await readSkillText(BUILD_SKILL), request }),
			}));
			return handed;
		},
		handPrototypeAddress: async (root: string, projectId: string, name: string, comment: CommentRef, newVersion: boolean): Promise<HandedComment> => {
			const canonical = opened.require(root);
			const { handed, prepared } = await handTask(ports, await agent(), async () => {
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
		saveBuilt: async (projectId: string, name: string, from: string | null): Promise<'saved' | 'waiting'> => {
			const fresh = from === null ? null : { from, me: me(), note: `For a comment on ${workLabel({ name: from })}` };
			const saved = await work.saveBuilt(projectId, name, fresh);
			if (saved === 'saved') deploys.page(projectId, name);
			return saved;
		},
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
