import { type Check, type Route, arg, callTable } from '../../src/core/handle';
import { tokenEditsOf } from '../../src/core/services/designSystem/tokenEdits';
import { triedValuesOf } from '../../src/core/services/designSystem/valueSources';
import type { TokenEdit, TriedValue } from '../../src/shared/contract';
import { asRecord } from '../../src/shared/json';
import { isPrototypeName } from '../../src/shared/prototypeNames';
import { type Theme, isTheme } from '../../src/shared/prototypeTheme';
import { hasExactly } from '../../src/shared/validate';
import {
	ASKS,
	type AskName,
	CODEBASE_ACTIONS,
	COMPONENT_LINKS,
	type CodebaseAction,
	type ComponentLink,
	LIMITS,
	type PageAsks,
	type Review,
} from './messages';

/**
 * The extension's own asks (`PageAsks`), answered as the core answers its calls: each by one handler, its arguments
 * checked first by the core's `handle`, in a table of the extension's that the bridge serves beside the core's.
 */

/** The longest a path in the design system is (a story file, a token's file). */
const MOST_PATH = 500;
const fail = (said: string): never => {
	throw new Error(said);
};

/** What a page's asks carry, each checked before its handler sees it. */
export const check = {
	/** A path of the design system: a component's story file, a token's file. */
	path: ((v) =>
		typeof v === 'string' && v.length > 0 && v.length <= MOST_PATH ? v : fail('That is not a file of the design system.')) as Check<string>,
	/** A line of a file, from 1. */
	line: ((v) => (Number.isSafeInteger(v) && (v as number) > 0 ? (v as number) : fail('That is not a line of a file.'))) as Check<number>,
	link: ((v) => ((COMPONENT_LINKS as readonly unknown[]).includes(v) ? v : fail('That is not a link of a component.'))) as Check<ComponentLink>,
	action: ((v) =>
		(CODEBASE_ACTIONS as readonly unknown[]).includes(v) ? v : fail('That is not something codebase work does.')) as Check<CodebaseAction>,
	/** A prototype to open for review: its project, its name, and the title its tab is given, in exactly that shape. */
	review: ((v) => {
		const r = asRecord(v);
		if (!hasExactly(r, ['projectId', 'name', 'title']) || typeof r.title !== 'string' || r.title.length > LIMITS.title)
			fail('That is not a prototype to open for review.');
		if (typeof r.name !== 'string' || !isPrototypeName(r.name)) fail('That is not a prototype to open for review.');
		return { projectId: arg.projectId(r.projectId), name: r.name as string, title: r.title as string };
	}) as Check<Review>,
	title: ((v) => (typeof v === 'string' && v.length <= LIMITS.title ? v : fail('That is not a title.'))) as Check<string>,
	task: ((v) => (typeof v === 'string' && v.length <= LIMITS.task ? v : fail('That is not what a prototype explores.'))) as Check<string>,
	folder: ((v) => (v === null || (typeof v === 'string' && v.length <= LIMITS.folder) ? v : fail('That is not a folder.'))) as Check<string | null>,
	edits: tokenEditsOf as Check<TokenEdit[]>,
	mode: ((v) => (isTheme(v) ? v : fail('That is not a mode.'))) as Check<Theme>,
	/** The library's commit values were tried on, by its sha (or a short one). */
	commit: ((v) => (typeof v === 'string' && /^[0-9a-f]{4,64}$/.test(v) ? v : fail('That is not a commit.'))) as Check<string>,
	values: triedValuesOf as Check<TriedValue[]>,
};

/** What each ask does, given what it carries once it is checked: the extension's own flows. */
export type AskHandlers = {
	[K in AskName]: (...args: Parameters<PageAsks[K]>) => unknown;
};

/** The extension's asks, each in its own table, its arguments checked as the core checks a call's: what the bridge serves. */
export const askRoutes = (handlers: AskHandlers): ReadonlyMap<AskName, Route> => {
	const { handle, served } = callTable<PageAsks>();
	const done =
		<A extends unknown[]>(fn: (...args: A) => unknown) =>
		async (...args: A) => {
			await fn(...args);
			return null;
		};
	handle('locateDesignSystem', [], done(handlers.locateDesignSystem));
	handle('getStarted', [], done(handlers.getStarted));
	handle('askNewPrototype', [], done(handlers.askNewPrototype));
	handle('newPrototype', [check.title, check.task, check.folder], done(handlers.newPrototype));
	handle('codebase', [check.action, arg.projectId], done(handlers.codebase));
	handle('openReview', [check.review], done(handlers.openReview));
	handle('openReviewInBrowser', [check.review], done(handlers.openReviewInBrowser));
	handle('copyReviewLink', [check.review], done(handlers.copyReviewLink));
	handle('openReviewPublished', [check.review], done(handlers.openReviewPublished));
	handle('openComponent', [check.path], done(handlers.openComponent));
	handle('componentLink', [check.path, check.link], done(handlers.componentLink));
	handle('openPrimitives', [], done(handlers.openPrimitives));
	handle('openVoiceAndTone', [], done(handlers.openVoiceAndTone));
	handle('openLibrarySource', [check.path, check.line], done(handlers.openLibrarySource));
	handle('openChanges', [], done(handlers.openChanges));
	handle('setTokenEdits', [check.edits], done(handlers.setTokenEdits));
	handle('setMode', [check.mode], done(handlers.setMode));
	handle('setValueTrial', [check.path, check.commit, check.values], done(handlers.setValueTrial));
	handle('syncDesignSystem', [], done(handlers.syncDesignSystem));
	// Every ask in the table is answered: one left out would be refused as not answered, wherever it was asked.
	const missing = ASKS.filter((name) => !served().has(name));
	if (missing.length > 0) throw new Error(`The extension does not answer ${missing.join(', ')}.`);
	return served();
};

/** What a check makes of something, or null when it refuses it. */
const tried = <T>(of: Check<T>, raw: unknown): T | null => {
	try {
		return of(raw);
	} catch {
		return null;
	}
};

/** A review a command was given (DSNR: Open a prototype for review, from code), read as a page's ask is, or null. */
export const readReview = (raw: unknown): Review | null => tried(check.review, raw);

/** The component a command was given (DSNR: Open a component, from code), by its story file, read as a page's ask is, or null. */
export const readComponentArg = (raw: unknown): string | null => {
	const r = asRecord(raw);
	return typeof raw === 'object' && raw !== null && hasExactly(r, ['id']) ? tried(check.path, r.id) : null;
};
