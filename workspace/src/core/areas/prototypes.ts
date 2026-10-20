import type { CallsDeps } from '../compose';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { folderName } from '../../shared/brief';
import type { Handed, CommentRef, HandedComment, OpenedPrototype, PrototypeReadiness } from '../../shared/contract';
import { coverPath, prototypeKey, prototypePagePath } from '../../shared/designPaths';
import { statesOf } from '../../shared/prototypeStates';
import { workLabel } from '../../shared/work';
import { ADDRESS_SKILL, chooseComment } from '../services/prototypes/address';
import { guidePart, prototypeAddressTask, prototypeBuildTask } from '../services/agent/agentTasks';
import { writeCommentsExport } from '../services/prototypes/commentsExport';
import { readDescriptor } from '../services/projects/descriptor';
import { handTask } from '../services/agent/handOver';
import { ensureLocalBranch } from '../services/platform/git';
import { INSTALL_COMMAND } from '../services/codebase/install';
import { jpegDataUrl } from '../services/prototypes/picture';
import { type CoverDeps, builtHere, ensureCovers } from '../services/prototypes/projectCovers';
import { BUILD_SKILL, GUIDE, type PrototypeSources, assignFolder } from '../services/prototypes/prototype';
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
