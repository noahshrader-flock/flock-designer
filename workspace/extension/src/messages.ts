import type { Context } from '../../src/main/services/findContext';
import { INVOKE, type InvokeName } from '../../src/shared/contract';
import type { Project } from '../../src/shared/domain/projects';
import { isPrototypeName } from '../../src/shared/prototypeNames';
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
	| { type: 'new-prototype' }
	| ({ type: 'open-review' } & Review);

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

/** What the extension sends the page: an answer to a call, by its id, an event of the core's, or what is open (`Context`). */
export type HostMessage =
	{ type: 'answer'; id: number; result: unknown } | { type: 'event'; name: string; payload: unknown } | { type: 'context'; context: Context };

const CALLS = new Set<string>(INVOKE);
const BARE = new Set(['ready', 'locate-design-system', 'new-prototype']);

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
	if (m.type === 'open-review')
		return hasKeys(m, ['type', 'projectId', 'name', 'title']) &&
			typeof m.projectId === 'string' &&
			typeof m.name === 'string' &&
			typeof m.title === 'string' &&
			m.title.length <= 300
			? { type: 'open-review', projectId: m.projectId, name: m.name, title: m.title }
			: null;
	return typeof m.type === 'string' && BARE.has(m.type) && hasKeys(m, ['type']) ? ({ type: m.type } as PanelMessage) : null;
};

/** What the person is told, until what the message asks for is built (Phase 4 of the plan). */
export const replyTo = (_message: { type: 'new-prototype' }): string => 'Starting a prototype from DSNR is not built yet.';
