import { type Answer, type CommentRef, type EventName, type InvokeName, type Payload, type Result } from '../shared/contract';
import { asRecord } from '../shared/json';
import { isPrototypeName } from '../shared/prototypeNames';
import { fail, ok } from '../shared/result';
import { isSafeBranchName } from './services/git';
import { assertUsableProjectId } from './services/iterations';
import { assertPrototypeName } from './services/prototype';

/**
 * How the core meets the window, whichever shell holds it: each call registered by its name in the contract's table, its
 * answer checked against `WorkspaceApi`, into a table of the core's own that the shell serves (`served`: Electron's IPC in
 * the app, `electronIpc.ts`), and each event sent by name through the shell's sink (`EventSink`).
 *
 * A handler returns its answer or throws a sentence for a person; it never returns a Result itself. An exception
 * crossing IPC arrives as a shapeless string, which is how a real problem turns into "something went wrong", so this is
 * the one place a throw becomes a Result.
 */

const guard =
	<Args extends unknown[], T>(fn: (...args: Args) => Promise<T> | T) =>
	async (...args: Args): Promise<Result<T>> => {
		try {
			return ok(await fn(...args));
		} catch (err) {
			return fail(err);
		}
	};

/** A call the window may make, as the core answers it: what it sent, untrusted, in; a Result out, never a throw. */
export type Route = (...sent: unknown[]) => Promise<Result<unknown>>;

/** Every call registered, by its name: what the shell serves, and nothing else. */
const routes = new Map<InvokeName, Route>();

/** Starts the table again: a registration is the whole of it (`registerIpc`), so registering again replaces it. */
export const clearRoutes = (): void => routes.clear();

/** The calls registered, for the shell to serve. */
export const served = (): ReadonlyMap<InvokeName, Route> => routes;

/** Turns what the window sent into what a handler takes, or throws a sentence saying why it will not. */
export type Check<T> = (value: unknown) => T;

/**
 * Answers the window's call `name`: each argument through its check, in order, before `fn` sees it, so the types a
 * handler declares are what it really has. Whatever the window sends is untrusted, and this is the one place it is
 * checked.
 */
export const handle = <K extends InvokeName, Args extends unknown[]>(
	name: K,
	checks: { [I in keyof Args]: Check<Args[I]> },
	fn: (...args: Args) => Answer<K> | Promise<Answer<K>>,
): void => {
	// As Electron's IPC refuses a second handler for a channel: one place answers each call.
	if (routes.has(name)) throw new Error(`${name} is answered twice.`);
	routes.set(
		name,
		guard((...sent: unknown[]) => fn(...((checks as Check<unknown>[]).map((check, i) => check(sent[i])) as Args))),
	);
};

const isPositiveInteger = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0;

const text =
	(what: string, max: number): Check<string> =>
	(v) => {
		if (typeof v !== 'string' || v.length > max)
			throw new Error(`That is not ${what}${max < 1_000 ? '' : ` (up to ${max.toLocaleString('en-US')} characters)`}.`);
		return v;
	};

/** The checks a handler is given, one per argument. */
export const arg = {
	/** A checkout's folder, as the window names it: still to be found among those the person opened. */
	root: text('a folder', 4096),
	projectId: ((v) => {
		if (typeof v !== 'string') throw new Error('That is not a project.');
		assertUsableProjectId(v);
		return v;
	}) as Check<string>,
	/** A prototype's name, `v2-i3`. */
	prototypeName: ((v) => {
		if (typeof v !== 'string') throw new Error('That is not a prototype.');
		assertPrototypeName(v);
		return v;
	}) as Check<string>,
	/** Any iteration's name: a prototype's, or `codebase`. */
	iterationName: ((v) => {
		if (typeof v !== 'string' || !(v === 'codebase' || isPrototypeName(v))) throw new Error(`"${String(v)}" is not an iteration.`);
		return v;
	}) as Check<string>,
	branch: ((v) => {
		if (typeof v !== 'string' || !isSafeBranchName(v)) throw new Error(`"${String(v)}" is not a branch name.`);
		return v;
	}) as Check<string>,
	/** A comment, by the review thread it is in and its own number. */
	comment: ((v) => {
		const r = asRecord(v);
		if (![r.thread, r.id].every(isPositiveInteger)) throw new Error('That is not a comment.');
		return { thread: r.thread as number, id: r.id as number };
	}) as Check<CommentRef>,
	/** A pin on the page: its comment's number alone, as the page knows it. */
	markerId: ((v) => {
		if (!isPositiveInteger(v)) throw new Error('That is not a comment.');
		return v;
	}) as Check<number>,
	/** Yes only for `true`; anything else is no. */
	flag: ((v) => v === true) as Check<boolean>,
	/** A short name the app looks up itself (a command, a design system, a repository): never more than a line. */
	name: text('a name', 300),
	/** An address, checked again by what opens it. */
	url: text('an address', 4096),
	/** Words a person wrote: a request to an agent, a comment. Bounded, since they go into a task or a GitHub body. */
	words: text('text', 20_000),
	/** Passed on as sent, for a value the service checks itself (an anchor, token edits, a picture). */
	unknown: ((v) => v) as Check<unknown>,
	/** What new work starts from: a repository the person opened (still to be found among them), and a branch in it. */
	startingPoint: ((v) => {
		if (v === undefined || v === null) return null;
		const r = asRecord(v);
		return { root: arg.root(r.root), branch: arg.branch(r.branch) };
	}) as Check<{ root: string; branch: string } | null>,
	/** `check`, or null when nothing is sent. */
	optional:
		<T>(check: Check<T>): Check<T | null> =>
		(v) =>
			v === undefined || v === null ? null : check(v),
};

/** How the core tells the window that `name` happened: the shell's (Electron's IPC in the app). */
export type EventSink = <K extends EventName>(name: K, payload: Payload<K>) => void;
