import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Work, Person } from '../../../shared/contract';
import { briefFolder, firstHeading, folderName, withFolder } from '../../../shared/brief';
import { projectPath, prototypeKey, workPath } from '../../../shared/designPaths';
import { isPrototypeName, nextVersionName } from '../../../shared/prototypeNames';
import { assertCover } from '../../../shared/validate';
import { resolveInside } from '../platform/paths';
import { parseWork, serializeWork, unreadableWork } from '../../../shared/workRecords';

/**
 * One writer per machine: the design repository's clone, or, without a clone, GitHub's API; never both, or the clone
 * could not catch up.
 */
export interface RecordStore {
	/** `path` is from the repository's root. */
	read(path: string): Promise<string | null>;
	readBytes(path: string): Promise<Buffer | null>;
	/** Without fetching it: shared files run to megabytes. */
	has(path: string): Promise<boolean>;
	write(path: string, content: string | Buffer, message: string): Promise<void>;
}

export const cloneStore = (designRoot: string, published: () => void): RecordStore => ({
	read: async (path) => {
		const file = resolveInside(designRoot, path);
		return existsSync(file) ? readFileSync(file, 'utf8') : null;
	},
	readBytes: async (path) => {
		const file = resolveInside(designRoot, path);
		return existsSync(file) ? readFileSync(file) : null;
	},
	has: async (path) => existsSync(resolveInside(designRoot, path)),
	write: async (path, content) => {
		const file = resolveInside(designRoot, path);
		mkdirSync(dirname(file), { recursive: true });
		writeFileSync(file, content);
		published();
	},
});

export const GUIDE = 'agents/ui-guide.md';
/** DSNR's workflow on top of the guide: the project folder, brief, context receipt and reviews. */
export const WORKFLOW = 'agents/dsnr.md';
export const BUILD_SKILL = 'skills/build-prototype.md';
export const MOVE_SKILL = 'skills/move-to-code.md';
export const ROUTE_SKILL = 'skills/record-the-route.md';

/**
 * The most a page may be: GitHub's own file limit (100 MB), with room to spare, and no lower limit of ours. A page with
 * images can run large, and refusing it would leave someone unable to save what they made.
 */
export const MAX_PAGE = 90_000_000;

export interface PrototypeBuild {
	source: string;
	page: string;
	buildCommand: string;
	checkCommand: string;
	/** The design system's clone it is built from, in place of the installed package; null for the installed one. */
	fromClone: string | null;
}

/** A file that cannot be read is refused rather than written over, or guessed at. */
export const readRecords = async (store: Pick<RecordStore, 'read'>, projectId: string): Promise<Work[]> => {
	const raw = await store.read(workPath(projectId));
	if (raw === null) return [];
	const records = parseWork(raw);
	if (records === null) throw new Error(unreadableWork(workPath(projectId)));
	return records;
};

const addRecord = async (
	store: RecordStore,
	existing: Work[],
	{
		projectId,
		name,
		note,
		me,
		basedOn,
		from,
		designSystemFrom,
		now,
	}: {
		projectId: string;
		name: string;
		note: string;
		me: Person | null;
		basedOn?: Work['basedOn'];
		from?: string;
		/** A version made from another builds as it does, being the same idea further on. */
		designSystemFrom?: Work['designSystemFrom'];
		now: Date;
	},
): Promise<Work> => {
	const record: Work = {
		projectId,
		name,
		branch: prototypeKey(projectId, name),
		commit: null,
		createdAt: now.toISOString(),
		// The record carries the gist; the brief carries the whole request.
		note: note.trim().split('\n')[0] ?? '',
		...(me ? { contributors: [me] } : {}),
		...(basedOn ? { basedOn } : {}),
		...(from ? { from } : {}),
		...(designSystemFrom ? { designSystemFrom } : {}),
	};
	await store.write(workPath(projectId), serializeWork([...existing, record]), `${projectId}: record prototype ${name}`);
	return record;
};

/**
 * Also starts the project (a brief with its title, in `folder`) when this is its first work. A project with a brief stays
 * in its folder, wherever the new version is started from.
 */
export const recordPrototype = async (
	store: RecordStore,
	{
		projectId,
		title,
		note,
		me,
		basedOn,
		folder = null,
		now = new Date(),
	}: { projectId: string; title: string; note: string; me: Person | null; basedOn?: Work['basedOn']; folder?: string | null; now?: Date },
): Promise<Work> => {
	const existing = await readRecords(store, projectId);
	const name = nextVersionName(existing.map((i) => i.name));
	const brief = projectPath(projectId, 'brief.md');
	const haveBrief = await store.read(brief);
	if (haveBrief === null || firstHeading(haveBrief) === null) {
		// A brief with no heading may still have a folder, which is kept.
		const written = `# ${title.replace(/\s+/g, ' ').trim()}\n\n${note.trim()}\n`;
		await store.write(brief, withFolder(written, haveBrief === null ? folder : briefFolder(haveBrief)), `${projectId}: start the project`);
	}
	return addRecord(store, existing, { projectId, name, note, me, basedOn, now });
};

/** The brief is where the folder is kept, so a project with none is refused rather than given one. */
export const assignFolder = async (store: RecordStore, projectId: string, folder: string | null): Promise<void> => {
	const path = projectPath(projectId, 'brief.md');
	const brief = await store.read(path);
	if (brief === null) throw new Error(`${projectId} has no brief, which is where its folder is kept.`);
	const name = folderName(folder);
	if (briefFolder(brief) === name) return;
	await store.write(
		path,
		withFolder(brief, name),
		name === null ? `${projectId}: taken out of its folder` : `${projectId}: put in the folder ${name}`,
	);
};

/**
 * Call it after writing the picture itself, so a record never names a picture that is not there. False, writing nothing,
 * when there is no record of the prototype.
 */
export const setCover = async (store: RecordStore, projectId: string, name: string, cover: string): Promise<boolean> => {
	assertCover(cover);
	const existing = await readRecords(store, projectId);
	if (!existing.some((i) => i.name === name)) return false;
	const updated = existing.map((i) => (i.name === name ? { ...i, cover } : i));
	await store.write(workPath(projectId), serializeWork(updated), `${projectId}: picture of prototype ${name}`);
	return true;
};

/** Which design system a version builds from: the clone's, or (removing the field) the product's installed package. */
export const setDesignSystemFrom = async (store: RecordStore, projectId: string, name: string, from: 'installed' | 'clone'): Promise<boolean> => {
	const existing = await readRecords(store, projectId);
	if (!existing.some((i) => i.name === name)) return false;
	const updated = existing.map((i) => {
		if (i.name !== name) return i;
		const { designSystemFrom: _was, ...rest } = i;
		return from === 'clone' ? { ...rest, designSystemFrom: 'clone' as const } : rest;
	});
	await store.write(
		workPath(projectId),
		serializeWork(updated),
		`${projectId}: prototype ${name} built from the design system's ${from === 'clone' ? 'clone' : 'installed package'}`,
	);
	return true;
};

/** A version's base moved to `commit`, as Refresh to latest does: false, writing nothing, when there is no record of it. */
export const setBaseCommit = async (store: RecordStore, projectId: string, name: string, commit: string): Promise<boolean> => {
	const existing = await readRecords(store, projectId);
	const was = existing.find((i) => i.name === name)?.basedOn;
	if (!was) return false;
	const updated = existing.map((i) => (i.name === name ? { ...i, basedOn: { ...was, commit } } : i));
	await store.write(workPath(projectId), serializeWork(updated), `${projectId}: prototype ${name} modeled on ${commit.slice(0, 7)}`);
	return true;
};

/** Named by the caller because its files are already under that name; refused when that name is taken. */
export const recordVersionFrom = async (
	store: RecordStore,
	{ projectId, name, from, note, me, now = new Date() }: { projectId: string; name: string; from: Work; note: string; me: Person | null; now?: Date },
): Promise<Work> => {
	assertPrototypeName(name);
	const existing = await readRecords(store, projectId);
	if (existing.some((i) => i.name === name))
		throw new Error(`${projectId} already has a ${name}. Try again: the change will go in the next version.`);
	return addRecord(store, existing, {
		projectId,
		name,
		note,
		me,
		basedOn: from.basedOn,
		from: from.name,
		designSystemFrom: from.designSystemFrom,
		now,
	});
};

export const assertPrototypeName = (name: string): void => {
	if (!isPrototypeName(name)) throw new Error(`"${name}" is not a prototype.`);
};

/** A prototype has no commits, so this stands in for one. */
export const contentHashOf = (source: string): string => createHash('sha1').update(source).digest('hex').slice(0, 12);

/** Folders. Whatever this machine does not have is null, and the task says so rather than letting the agent guess. */
export interface PrototypeSources {
	/** On the branch the prototype is modeled on. */
	code: string;
	productGuidance: string | null;
	/** The design system's checkout. */
	designSystemGuidance: string | null;
	/** As installed in the product: the version it really renders with. */
	installedDesignSystem: string | null;
	/** Said when what is installed may not be what the base's lockfile pins, or that cannot be told: `installedAgainstBase`. */
	installedAgainstBase: string | null;
	sharedStandards: string | null;
	nodeModules: string | null;
}

/** `continuing` is the branch, when the work was started before. */
export const buildInCodebaseLead = ({ label, projectId, continuing }: { label: string; projectId: string; continuing: string | null }): string =>
	continuing
		? `Continue building ${label} of the ${projectId} prototype into this codebase, on ${continuing}. Some of it may be done already, so look at the branch and the audit first.`
		: `Build ${label} of the ${projectId} prototype into this codebase.`;
