import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Iteration, Person } from '../../shared/contract';
import { firstHeading, isQuickName, nextQuickName, quickKey } from '../../shared/projects';
import { resolveInside } from './paths';

/**
 * Quick prototypes: what is recorded, where the page is kept, and what the agent is told.
 *
 * **One writer per machine.** A machine with the design repository cloned writes into the clone and lets
 * the publisher send it, exactly as the other records go; one without a clone writes through GitHub's
 * API. Never both from one machine, which is what once left a clone that could not catch up.
 */
export interface RecordStore {
	/** A file in the design repository, by its path from the repository's root, or null. */
	read(path: string): Promise<string | null>;
	write(path: string, content: string, message: string): Promise<void>;
}

/** The design repository's clone on this machine. `published` runs after each write. */
export const cloneStore = (designRoot: string, published: () => void): RecordStore => ({
	read: async (path) => {
		const file = resolveInside(designRoot, path);
		return existsSync(file) ? readFileSync(file, 'utf8') : null;
	},
	write: async (path, content) => {
		const file = resolveInside(designRoot, path);
		mkdirSync(dirname(file), { recursive: true });
		writeFileSync(file, content);
		published();
	},
});

export const BUILD_SKILL = 'skills/build-quick-prototype.md';
export const MOVE_SKILL = 'skills/move-to-code.md';

/** The size a page may be. A prototype page is tens of kilobytes; past this it is not one. */
export const MAX_PAGE = 2_000_000;

const records = (projectId: string) => `projects/${projectId}/iterations.json`;

/**
 * Records a new quick prototype, and the project itself when this is its first work: a brief with its
 * title, which is what the project list names it by. The page comes later, once the agent has made it.
 */
export const recordQuick = async (
	store: RecordStore,
	{
		projectId,
		title,
		note,
		me,
		basedOn,
		now = new Date(),
	}: { projectId: string; title: string; note: string; me: Person | null; basedOn?: Iteration['basedOn']; now?: Date },
): Promise<Iteration> => {
	const raw = await store.read(records(projectId));
	let existing: Iteration[] = [];
	if (raw !== null) {
		try {
			const parsed = JSON.parse(raw) as unknown;
			existing = Array.isArray(parsed) ? (parsed as Iteration[]) : [];
		} catch {
			throw new Error(`projects/${projectId}/iterations.json is not readable JSON, so nothing was added to it.`);
		}
	}
	const name = nextQuickName(existing.map((i) => i.name));
	const iteration: Iteration = {
		projectId,
		name,
		branch: quickKey(projectId, name),
		commit: null,
		createdAt: now.toISOString(),
		// The record carries the gist; the brief carries the whole request, which is what reviewers and the
		// move into the code read.
		note: note.trim().split('\n')[0] ?? '',
		...(me ? { contributors: [me] } : {}),
		...(basedOn ? { basedOn } : {}),
	};
	const brief = `projects/${projectId}/brief.md`;
	const haveBrief = await store.read(brief);
	if (haveBrief === null || firstHeading(haveBrief) === null) {
		await store.write(brief, `# ${title.replace(/\s+/g, ' ').trim()}\n\n${note.trim()}\n`, `${projectId}: start the project`);
	}
	await store.write(records(projectId), `${JSON.stringify([...existing, iteration], null, 2)}\n`, `${projectId}: record quick prototype ${name}`);
	return iteration;
};

export const assertQuickName = (name: string): void => {
	if (!isQuickName(name)) throw new Error(`"${name}" is not a quick prototype.`);
};

/**
 * What the agent is told for a quick prototype. The skill says how; this says where. The request is the
 * person's own words, and comes last, after everything that frames it.
 */
/**
 * What a quick prototype's agent may read, each a folder: the product's code (on the branch it is modelled
 * on), and the guidance the code is built to, in its three layers. Every one is optional: whatever this
 * machine does not have is left out, and the task says so rather than letting the agent guess.
 */
export interface QuickSources {
	/** The product's code, on the branch the prototype is modelled on. */
	code: string;
	/** The product's own Flock Designer guidance: how its app is put together, its patterns, its rules. */
	productGuidance: string | null;
	/** The design system's checkout: its guidance (in its context folder) and its components' source. */
	designSystemGuidance: string | null;
	/** The design system as installed in the product: the version it really renders with. */
	installedDesignSystem: string | null;
	/** The standards every product shares. */
	sharedStandards: string | null;
}

export const quickReadable = (s: QuickSources | null): string[] =>
	s ? [s.code, s.productGuidance, s.designSystemGuidance, s.installedDesignSystem, s.sharedStandards].filter((d): d is string => d !== null) : [];

/**
 * What the agent is told for a quick prototype. The skill says how; this says where everything is. The
 * request is the person's own words, and comes last, after everything that frames it.
 */
export const quickBuildTask = ({
	skill,
	pageFile,
	sources,
	request,
}: {
	skill: string;
	pageFile: string;
	sources: QuickSources | null;
	request: string;
}): string => {
	const line = (label: string, dir: string | null, missing: string) => (dir ? `- **${label}:** \`${dir}\`` : `- **${label}:** not on this machine. ${missing}`);
	return [
		skill.trim(),
		'',
		'## This run',
		'',
		`Write the page to \`${pageFile}\`. That file is the whole prototype: nothing else you write is kept.`,
		'',
		...(sources
			? [
					'What you may read. **Read only: never change anything in any of these.**',
					'',
					line('The product\'s code', sources.code, ''),
					line("The product's guidance", sources.productGuidance, 'Say so in your summary: the page cannot follow the product\'s structure without it.'),
					line("The design system (guidance and source)", sources.designSystemGuidance, 'Use the installed design system and the product\'s own code for tokens and components.'),
					line('The design system as installed', sources.installedDesignSystem, 'Its version cannot be confirmed; say so.'),
					line('Shared standards', sources.sharedStandards, ''),
				]
			: ['There is no product repository on this machine, so build from the request and keep the design plain and neutral. Say so in your summary.']),
		'',
		'## What the person asked for',
		'',
		request.trim(),
	].join('\n');
};

/** What the agent is told when a quick prototype moves into the codebase: audit first, then build. */
export const moveToCodeTask = ({
	skill,
	pageFile,
	auditFile,
	name,
	basedOn,
}: {
	skill: string;
	pageFile: string;
	auditFile: string;
	name: string;
	basedOn?: Iteration['basedOn'];
}): string =>
	[
		`Build quick prototype ${name} of this project into the codebase.`,
		'',
		skill.trim(),
		'',
		'## This run',
		'',
		`The quick prototype's page is \`${pageFile}\`. Read it; do not change it.`,
		basedOn
			? `It was modelled on \`${basedOn.branch}\` of ${basedOn.repository}${basedOn.commit ? ` at ${basedOn.commit.slice(0, 7)}` : ''}; the code may have moved on since.`
			: 'It was made without the product code to look at, so expect more of it to differ from how the product really works.',
		`Write the audit to \`${auditFile}\` before you change any code.`,
	].join('\n');
