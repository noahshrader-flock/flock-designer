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
 * Prototypes: what is recorded, where the page is kept, and what the agent is told.
 *
 * **One writer per machine.** A machine with the design repository cloned writes into the clone and lets
 * the publisher send it, exactly as the other records go; one without a clone writes through GitHub's
 * API. Never both from one machine, which is what once left a clone that could not catch up.
 */
export interface RecordStore {
	/** A file in the design repository, by its path from the repository's root, or null. */
	read(path: string): Promise<string | null>;
	/** A file as the bytes it is (a picture), or null. */
	readBytes(path: string): Promise<Buffer | null>;
	/** Whether a file is there, without fetching it: shared files run to megabytes. */
	has(path: string): Promise<boolean>;
	/** Text, or the bytes of a picture. */
	write(path: string, content: string | Buffer, message: string): Promise<void>;
}

/** The design repository's clone on this machine. `published` runs after each write. */
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

/** How to build UI in a Flock product: the builder's guide, the first part of every task (`guidePart`). */
export const GUIDE = 'agents/ui-guide.md';
export const BUILD_SKILL = 'skills/build-prototype.md';
export const MOVE_SKILL = 'skills/move-to-code.md';
export const ROUTE_SKILL = 'skills/record-the-route.md';

/**
 * The most a page may be: GitHub's own limit for a file (100 MB), with room to spare. Nothing of ours sits
 * below it. A page built from the real design system is several MB, and a prototype with images can be far
 * more; refusing one for being "too big" would leave someone unable to save what they made, which is the one
 * thing this must not do.
 */
export const MAX_PAGE = 90_000_000;

/** Where a prototype is written, and the exact command that checks it builds. React, always: see the skill. */
export interface PrototypeBuild {
	source: string;
	page: string;
	buildCommand: string;
	/** The build's own accessibility check, run after it builds (A6). */
	checkCommand: string;
}

/**
 * A project's records, through anything that reads a file of the design repository. A file that cannot be read is
 * refused rather than written over, or guessed at.
 */
export const readRecords = async (store: Pick<RecordStore, 'read'>, projectId: string): Promise<Work[]> => {
	const raw = await store.read(workPath(projectId));
	if (raw === null) return [];
	const records = parseWork(raw);
	if (records === null) throw new Error(unreadableWork(workPath(projectId)));
	return records;
};

/** Adds one prototype's record to its project's. */
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
		now,
	}: { projectId: string; name: string; note: string; me: Person | null; basedOn?: Work['basedOn']; from?: string; now: Date },
): Promise<Work> => {
	const record: Work = {
		projectId,
		name,
		branch: prototypeKey(projectId, name),
		commit: null,
		createdAt: now.toISOString(),
		// The record carries the gist; the brief carries the whole request, which is what reviewers and the
		// move into the code read.
		note: note.trim().split('\n')[0] ?? '',
		...(me ? { contributors: [me] } : {}),
		...(basedOn ? { basedOn } : {}),
		...(from ? { from } : {}),
	};
	await store.write(workPath(projectId), serializeWork([...existing, record]), `${projectId}: record prototype ${name}`);
	return record;
};

/**
 * Records a new prototype, the next version, and the project itself when this is its first work: a brief with its
 * title, which is what the project list names it by, in the folder it is started in. A project that has a brief already
 * stays in its folder: a new version started from another folder's view does not move it. The page comes later, once the
 * agent has made it.
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

/**
 * Puts a project in a folder, or in none for null (the folders plan): its brief, read just before, with only its folder
 * changed, written once with a message that says so. Nothing is written when it is in that folder already. The brief is
 * where the folder is kept, so a project with none is refused rather than given one.
 */
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
 * Names a prototype's picture on its record (`Work.cover`), changing nothing else in it or in any other record.
 * Written after the picture itself, so a record never names a picture that is not there. False when there is no record
 * of the prototype, as for a page that was never recorded: nothing is written then.
 */
export const setCover = async (store: RecordStore, projectId: string, name: string, cover: string): Promise<boolean> => {
	assertCover(cover);
	const existing = await readRecords(store, projectId);
	if (!existing.some((i) => i.name === name)) return false;
	const updated = existing.map((i) => (i.name === name ? { ...i, cover } : i));
	await store.write(workPath(projectId), serializeWork(updated), `${projectId}: picture of prototype ${name}`);
	return true;
};

/**
 * Records a new version started from another, named before it was made (its files are already under that name), modeled
 * on what the version it came from was, and saying which that was. Refused when that name is taken.
 */
export const recordVersionFrom = async (
	store: RecordStore,
	{ projectId, name, from, note, me, now = new Date() }: { projectId: string; name: string; from: Work; note: string; me: Person | null; now?: Date },
): Promise<Work> => {
	assertPrototypeName(name);
	const existing = await readRecords(store, projectId);
	if (existing.some((i) => i.name === name))
		throw new Error(`${projectId} already has a ${name}. Try again: the change will go in the next version.`);
	return addRecord(store, existing, { projectId, name, note, me, basedOn: from.basedOn, from: from.name, now });
};

export const assertPrototypeName = (name: string): void => {
	if (!isPrototypeName(name)) throw new Error(`"${name}" is not a prototype.`);
};

/**
 * A short hash of a prototype's source or page: what tells the screen whether an agent changed it,
 * and what a comment it changed records. A prototype has no commits, so this stands in for one.
 */
export const contentHashOf = (source: string): string => createHash('sha1').update(source).digest('hex').slice(0, 12);

/**
 * What a prototype's agent may read, each a folder: the product's code (on the branch it is modeled
 * on), and the guidance the code is built to, in its three layers. Every one is optional: whatever this
 * machine does not have is left out, and the task says so rather than letting the agent guess.
 */
export interface PrototypeSources {
	/** The product's code, on the branch the prototype is modeled on. */
	code: string;
	/** The product's own DSNR guidance: how its app is put together, its patterns, its rules. */
	productGuidance: string | null;
	/** The design system's checkout: its guidance (in its context folder) and its components' source. */
	designSystemGuidance: string | null;
	/** The design system as installed in the product: the version it really renders with. */
	installedDesignSystem: string | null;
	/** The standards every product shares. */
	sharedStandards: string | null;
	/** The product's installed packages, which a React prototype is built against. */
	nodeModules: string | null;
}

export const prototypeReadable = (s: PrototypeSources | null): string[] =>
	s
		? [s.code, s.productGuidance, s.designSystemGuidance, s.installedDesignSystem, s.sharedStandards, s.nodeModules].filter(
				(d): d is string => d !== null,
			)
		: [];

/**
 * The first line of the Claude Code conversation that builds a prototype into the code: short, pointing at the task
 * written beside the prototype. `continuing` is the branch, when the work was started before: then it says to look at
 * what is there first.
 */
export const buildInCodebasePrompt = ({
	label,
	projectId,
	taskFile,
	continuing,
}: {
	label: string;
	projectId: string;
	taskFile: string;
	continuing: string | null;
}): string =>
	[
		continuing
			? `Continue building ${label} of the ${projectId} prototype into this codebase, on ${continuing}. Some of it may be done already, so look at the branch and the audit first.`
			: `Build ${label} of the ${projectId} prototype into this codebase.`,
		`Your task, with the skill to follow and the prototype's files, is in ${taskFile}: read it and do what it says.`,
	].join(' ');

/** The first line of the conversation that builds a new prototype, in Claude Code: short, pointing at the task written beside it, which is complete. */
export const prototypeBuildPrompt = ({ label, projectId, taskFile }: { label: string; projectId: string; taskFile: string }): string =>
	[`Build prototype ${label} of ${projectId}.`, `Your task is in ${taskFile}. It is complete: read all of it, then do what it says, in order.`].join(
		' ',
	);
