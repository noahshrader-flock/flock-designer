import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Iteration, Person } from '../../shared/contract';
import {
	assertCover,
	briefFolder,
	firstHeading,
	folderName,
	isPrototypeName,
	nextPrototypeName,
	projectPath,
	prototypeKey,
	withFolder,
} from '../../shared/projects';
import { addressOpening } from './address';
import { lightCheckLine } from './engineeringHandoff';
import { resolveInside } from './paths';
import { parseIterations, serializeIterations } from '../../shared/records';

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

export const BUILD_SKILL = 'skills/build-prototype.md';
export const MOVE_SKILL = 'skills/move-to-code.md';

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
}

/**
 * A project's iteration records, through anything that reads a file of the design repository. A file that cannot be read
 * is refused rather than written over, or guessed at.
 */
export const readRecords = async (store: Pick<RecordStore, 'read'>, projectId: string): Promise<Iteration[]> => {
	const raw = await store.read(projectPath(projectId, 'iterations.json'));
	if (raw === null) return [];
	const records = parseIterations(raw);
	if (records === null) throw new Error(`${projectPath(projectId, 'iterations.json')} is not a readable list of records, so it was left as it is.`);
	return records;
};

/** Adds one prototype's record to its project's. */
const addRecord = async (
	store: RecordStore,
	existing: Iteration[],
	{
		projectId,
		name,
		note,
		me,
		basedOn,
		now,
	}: { projectId: string; name: string; note: string; me: Person | null; basedOn?: Iteration['basedOn']; now: Date },
): Promise<Iteration> => {
	const iteration: Iteration = {
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
	};
	await store.write(
		projectPath(projectId, 'iterations.json'),
		serializeIterations([...existing, iteration]),
		`${projectId}: record prototype ${name}`,
	);
	return iteration;
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
	}: { projectId: string; title: string; note: string; me: Person | null; basedOn?: Iteration['basedOn']; folder?: string | null; now?: Date },
): Promise<Iteration> => {
	const existing = await readRecords(store, projectId);
	const name = nextPrototypeName(existing.map((i) => i.name));
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
 * Names a prototype's picture on its record (`Iteration.cover`), changing nothing else in it or in any other record.
 * Written after the picture itself, so a record never names a picture that is not there. False when there is no record
 * of the prototype, as for a page that was never recorded: nothing is written then.
 */
export const setCover = async (store: RecordStore, projectId: string, name: string, cover: string): Promise<boolean> => {
	assertCover(cover);
	const existing = await readRecords(store, projectId);
	if (!existing.some((i) => i.name === name)) return false;
	const updated = existing.map((i) => (i.name === name ? { ...i, cover } : i));
	await store.write(projectPath(projectId, 'iterations.json'), serializeIterations(updated), `${projectId}: picture of prototype ${name}`);
	return true;
};

/**
 * Records a refinement of a prototype: the next iteration of its version, named before it was made (its files are
 * already under that name), modeled on what the iteration it came from was. Refused when that name is taken.
 */
export const recordIteration = async (
	store: RecordStore,
	{
		projectId,
		name,
		from,
		note,
		me,
		now = new Date(),
	}: { projectId: string; name: string; from: Iteration; note: string; me: Person | null; now?: Date },
): Promise<Iteration> => {
	assertPrototypeName(name);
	const existing = await readRecords(store, projectId);
	if (existing.some((i) => i.name === name))
		throw new Error(`${projectId} already has a ${name}. Try again: the change will go in the next iteration.`);
	return addRecord(store, existing, { projectId, name, note, me, basedOn: from.basedOn, now });
};

export const assertPrototypeName = (name: string): void => {
	if (!isPrototypeName(name)) throw new Error(`"${name}" is not a prototype.`);
};

/**
 * Which version of a prototype's source this is, as a short hash: what tells the screen whether an agent changed it,
 * and what a comment it changed records. A prototype has no commits, so this stands in for one.
 */
export const prototypeVersionOf = (source: string): string => createHash('sha1').update(source).digest('hex').slice(0, 12);

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

/** What a prototype's agent may read, said the same way for building one and for changing one. */
const readableLines = (sources: PrototypeSources): string[] => {
	const line = (label: string, dir: string | null, missing: string) =>
		dir ? `- **${label}:** \`${dir}\`` : `- **${label}:** not on this machine. ${missing}`;
	return [
		'What you may read. **Read only: never change anything in any of these.**',
		'',
		line("The product's code", sources.code, ''),
		line("The product's guidance", sources.productGuidance, "Say so in your summary: the page cannot follow the product's structure without it."),
		line(
			'The design system (guidance and source)',
			sources.designSystemGuidance,
			"Use the installed design system and the product's own code for tokens and components.",
		),
		line('The design system as installed', sources.installedDesignSystem, 'Its version cannot be confirmed; say so.'),
		line('Shared standards', sources.sharedStandards, ''),
		line("The product's installed packages", sources.nodeModules, ''),
	];
};

/**
 * What the agent is told for a prototype. The skill says how; this says where everything is. The
 * request is the person's own words, and comes last, after everything that frames it.
 */
export const prototypeBuildTask = ({
	skill,
	build,
	sources,
	accessibility,
	voice,
	request,
}: {
	skill: string;
	build: PrototypeBuild;
	sources: PrototypeSources;
	/** The accessibility section (`taskAccessibility`): the rules and the product's target. */
	accessibility: string;
	/** The voice and tone section (`taskVoice`): empty when the design repository has none written. */
	voice: string;
	request: string;
}): string =>
	[
		skill.trim(),
		'',
		'## This run',
		'',
		`- Write \`${build.source}\`. That file is the whole prototype: nothing else you write is kept.`,
		`- Check it builds, and build it again after every change, with exactly: \`${build.buildCommand}\``,
		`  It writes the page to \`${build.page}\`. Do not finish while it reports an error.`,
		'',
		...readableLines(sources),
		'',
		accessibility,
		'',
		...(voice ? [voice, ''] : []),
		'## What the person asked for',
		'',
		request.trim(),
	].join('\n');

/**
 * What the agent is told to act on one comment on a prototype. The same comments file and the same shared skill as
 * on a branch, plus how a prototype is made, since the change is made to one. Like the branch task, it carries none
 * of what the reviewer wrote: their words reach the agent only through the file.
 */
export const prototypeAddressTask = ({
	addressSkill,
	buildSkill,
	build,
	sources,
	accessibility,
	voice,
	commentsPath,
	number,
	name,
	where = null,
}: {
	addressSkill: string;
	buildSkill: string;
	build: PrototypeBuild;
	sources: PrototypeSources;
	/** The accessibility section (`taskAccessibility`). */
	accessibility: string;
	/** The voice and tone section (`taskVoice`): empty when the design repository has none written. */
	voice: string;
	commentsPath: string;
	/** The comment's number, as on its pin. */
	number: number;
	/** The iteration the comment is on. */
	name: string;
	/** Where the change is made, when that is not the iteration commented on: see `whereTheChangeGoes`. */
	where?: string | null;
}): string =>
	[
		...addressOpening(number, commentsPath, `prototype ${name}`),
		'',
		'## This run',
		'',
		`- This is a prototype: it has no branch, and nothing is committed. Its whole source is \`${build.source}\`; change that file and nothing else.`,
		...(where ? [`- The comment is on ${name}. ${where}`] : []),
		`- After every change, build it with exactly: \`${build.buildCommand}\``,
		`  It writes the page to \`${build.page}\`. Do not finish while it reports an error.`,
		'',
		...readableLines(sources),
		'',
		accessibility,
		'',
		...(voice ? [voice, ''] : []),
		'## How to act on a comment',
		'',
		addressSkill.trim(),
		'',
		'## How a prototype is made',
		'',
		'Anything you change follows this, as the original page did.',
		'',
		buildSkill.trim(),
	].join('\n');

/** What the agent is told when a prototype moves into the codebase: audit first, then build. */
/**
 * The first line of the Claude Code conversation that builds a prototype into the code: short, pointing at the task
 * written beside the prototype. `continuing` is the branch, when the work was started before: then it says to look at
 * what is there first.
 */
export const moveToCodePrompt = ({
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
			? `Continue building prototype ${label} of ${projectId} into this codebase, on ${continuing}. Some of it may be done already, so look at the branch and the audit first.`
			: `Build prototype ${label} of ${projectId} into this codebase.`,
		`Your task, with the skill to follow and the prototype's files, is in ${taskFile}: read it and do what it says.`,
	].join(' ');

export const moveToCodeTask = ({
	skill,
	pageFile,
	auditFile,
	name,
	basedOn,
	sourceFile,
	accessibility,
	voice,
	lightCheck,
	shared,
}: {
	skill: string;
	pageFile: string;
	/** The product's `check-iteration` command, or null when its workspace file names none. */
	lightCheck: string | null;
	/** The shared folders the agent may read (`sharedGuidance().note`): opened in the editor, it is given no others. */
	shared: string;
	/** The accessibility section (`taskAccessibility`), with what the prototype's check left open. */
	accessibility: string;
	/** The voice and tone section (`taskVoice`): empty when the design repository has none written. */
	voice: string;
	/** The React source, when the prototype was written in React. */
	sourceFile?: string | null;
	auditFile: string;
	name: string;
	basedOn?: Iteration['basedOn'];
}): string =>
	[
		`Build prototype ${name} of this project into the codebase.`,
		'',
		skill.trim(),
		'',
		'## This run',
		'',
		`The prototype's page is \`${pageFile}\`. Read it; do not change it.`,
		...(sourceFile
			? [`It was written in React with the real design system: its source is \`${sourceFile}\`. Start from that, not from the page.`]
			: []),
		basedOn
			? `It was modeled on \`${basedOn.branch}\` of ${basedOn.repository}${basedOn.commit ? ` at ${basedOn.commit.slice(0, 7)}` : ''}; the code may have moved on since.`
			: 'It was made without the product code to look at, so expect more of it to differ from how the product really works.',
		`Write the audit to \`${auditFile}\` before you change any code.`,
		lightCheckLine(lightCheck),
		'',
		accessibility,
		...(voice ? ['', voice] : []),
	].join('\n') + shared;
