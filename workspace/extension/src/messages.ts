import type { Context } from '../../src/main/services/findContext';
import { INVOKE, type InvokeName } from '../../src/shared/contract';
import type { Project } from '../../src/shared/domain/projects';
import { isPrototypeName } from '../../src/shared/prototypeNames';
import { PROJECT_ID } from '../../src/shared/validate';
import { iterationLabel, workOf } from '../../src/shared/work';

/**
 * What the panel's page may ask of the extension, and nothing else: a call to the core by its name in the contract's
 * table, or one of the panel's own few requests (signing in is VS Code's, from its title bar, so the page cannot ask for it). The page is the extension's own, but what it sends is still read as the
 * app reads what its window sends: only a message it knows, in exactly that shape, so a page that went wrong can ask for
 * nothing new. What a call carries is checked again where the core answers it. No `vscode` import, so it is tested alone.
 */
export type PanelMessage =
	| { type: 'call'; id: number; name: InvokeName; args: unknown[] }
	| { type: 'ready' }
	| { type: 'locate-design-system' }
	| { type: 'get-started' }
	| { type: 'ask-new-prototype' }
	| { type: 'codebase'; action: CodebaseAction; projectId: string }
	| { type: 'new-prototype'; title: string; task: string; folder: string | null }
	| ({ type: 'open-review' } & Review)
	| ({ type: 'open-review-in-browser' } & Review);

/**
 * What can be done with a project's codebase work from the panel: its preview, Handoff, Share, and the work on GitHub.
 * The page names the project only; the extension finds the work, and where it is, itself.
 */
export const CODEBASE_ACTIONS = ['preview', 'hand-off', 'share', 'open-code'] as const;
export type CodebaseAction = (typeof CODEBASE_ACTIONS)[number];

/** A prototype to open for review: its project, its name, and the title its tab is given. */
export interface Review {
	projectId: string;
	name: string;
	title: string;
}

/**
 * A project's prototypes that have a review page, newest first, as opening one asks: the panel's row opens the first, and
 * DSNR: Open a prototype for review offers them all. A prototype has a page when the site can lay its name out.
 */
export const reviewsOf = (project: Pick<Project, 'id' | 'title' | 'iterations'>): Review[] =>
	workOf(project.iterations, 'prototype')
		.filter((i) => isPrototypeName(i.name))
		.map((i) => ({ projectId: project.id, name: i.name, title: `${project.title} · ${iterationLabel(i)}` }));

/**
 * What the extension sends the page: an answer to a call, by its id, an event of the core's, what is open (`Context`), or
 * that the projects changed (one was made), so the list is read again, or to open one of its dialogs (`Panels.show`).
 */
export type HostMessage =
	| { type: 'answer'; id: number; result: unknown }
	| { type: 'event'; name: string; payload: unknown }
	/** What is open, and why its design system cannot be read when it cannot (`showFound`). */
	| { type: 'context'; context: Context; unreadable?: string }
	| { type: 'projects-changed' }
	| { type: 'open-dialog'; dialog: PanelDialog };

/** The dialogs the panel has: each is opened for what it is about, by the panel or by the extension (`open-dialog`). */
export type PanelDialog =
	| { kind: 'new' }
	| { kind: 'assign'; projectId: string }
	| { kind: 'build'; projectId: string }
	| { kind: 'hand-off'; projectId: string }
	| { kind: 'comments'; projectId: string };

const CALLS = new Set<string>(INVOKE);
const BARE = new Set(['ready', 'locate-design-system', 'get-started', 'ask-new-prototype']);
/** The most a name, what a prototype explores, and a folder's name may be: more is not what a person wrote in a box. */
export const LIMITS = { title: 300, task: 4000, folder: 100 };

const hasKeys = (raw: object, keys: string[]): boolean => {
	const own = Object.keys(raw).sort();
	return own.length === keys.length && own.every((k, i) => k === [...keys].sort()[i]);
};

/** The message, or null for anything that is not one exactly. */
export const readMessage = (raw: unknown): PanelMessage | null => {
	if (typeof raw !== 'object' || raw === null) return null;
	const m = raw as Record<string, unknown>;
	if (m.type === 'call')
		return hasKeys(m, ['type', 'id', 'name', 'args']) &&
			typeof m.id === 'number' &&
			Number.isSafeInteger(m.id) &&
			m.id > 0 &&
			typeof m.name === 'string' &&
			CALLS.has(m.name) &&
			Array.isArray(m.args)
			? { type: 'call', id: m.id, name: m.name as InvokeName, args: m.args }
			: null;
	if (m.type === 'open-review' || m.type === 'open-review-in-browser')
		return hasKeys(m, ['type', 'projectId', 'name', 'title']) &&
			typeof m.projectId === 'string' &&
			typeof m.name === 'string' &&
			typeof m.title === 'string' &&
			m.title.length <= 300
			? { type: m.type, projectId: m.projectId, name: m.name, title: m.title }
			: null;
	if (m.type === 'codebase')
		return hasKeys(m, ['type', 'action', 'projectId']) &&
			typeof m.action === 'string' &&
			(CODEBASE_ACTIONS as readonly string[]).includes(m.action) &&
			typeof m.projectId === 'string' &&
			PROJECT_ID.test(m.projectId)
			? { type: 'codebase', action: m.action as CodebaseAction, projectId: m.projectId }
			: null;
	if (m.type === 'new-prototype')
		return hasKeys(m, ['type', 'title', 'task', 'folder']) &&
			typeof m.title === 'string' &&
			m.title.length <= LIMITS.title &&
			typeof m.task === 'string' &&
			m.task.length <= LIMITS.task &&
			(m.folder === null || (typeof m.folder === 'string' && m.folder.length <= LIMITS.folder))
			? { type: 'new-prototype', title: m.title, task: m.task, folder: m.folder }
			: null;
	return typeof m.type === 'string' && BARE.has(m.type) && hasKeys(m, ['type']) ? ({ type: m.type } as PanelMessage) : null;
};

/** A review a command was given (DSNR: Open a prototype for review, from code), read as the panel's message is, or null. */
export const readReview = (raw: unknown): Review | null => {
	if (typeof raw !== 'object' || raw === null || 'type' in raw) return null;
	const read = readMessage({ ...raw, type: 'open-review' });
	return read?.type === 'open-review' ? { projectId: read.projectId, name: read.name, title: read.title } : null;
};

/** The project a command was given, from a row's right-click menu (its `data-vscode-context`), or null. */
export const readProjectArg = (raw: unknown): string | null => {
	const id = typeof raw === 'object' && raw !== null ? (raw as { projectId?: unknown }).projectId : undefined;
	return typeof id === 'string' && PROJECT_ID.test(id) ? id : null;
};
