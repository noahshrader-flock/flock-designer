import { type Answer, type CommentRef, type EventName, type InvokeName, type Payload, type Result, type WorkspaceApi } from '../shared/contract';
import { asRecord } from '../shared/json';
import { fail, ok } from '../shared/result';
import { isSafeBranchName } from './services/platform/git';
import { assertUsableProjectId } from './services/projects/workRecords';
import { assertPrototypeName } from './services/prototypes/prototype';

/**
 * How the core meets the window, whichever shell holds it: each call registered by name, its answer checked against
 * `WorkspaceApi`, in a table the shell serves (`served`), and each event sent through the shell's sink (`EventSink`). A handler
 * throws a sentence for a person and this is the one place it becomes a Result: a throw crossing IPC arrives shapeless.
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

/** Turns what the window sent into what a handler takes, or throws a sentence saying why it will not. */
export type Check<T> = (value: unknown) => T;

/** What a call of `Api` answers, unwrapped from its Result. */
export type AnswerOf<Api, K extends keyof Api> = Api[K] extends (...args: never[]) => Promise<Result<infer T>> ? T : never;

/**
 * A table of calls, by name, each answered by one handler with its arguments checked first: the core's own (`handle`), and
 * any shell's for what it answers itself (the VS Code extension's asks). `served` is the table, for the shell to serve.
 */
export const callTable = <Api>() => {
	const routes = new Map<keyof Api & string, Route>();
	return {
		/**
		 * Answers the call `name`: each argument through its check, in order, before `fn` sees it, so the types a handler
		 * declares are what it really has. Whatever the window sends is untrusted, and this is the one place it is checked.
		 */
		handle: <K extends keyof Api & string, Args extends unknown[]>(
			name: K,
			checks: { [I in keyof Args]: Check<Args[I]> },
			fn: (...args: Args) => AnswerOf<Api, K> | Promise<AnswerOf<Api, K>>,
		): void => {
			// One place answers each call: a second handler for a name is refused.
			if (routes.has(name)) throw new Error(`${name} is answered twice.`);
			routes.set(
				name,
				guard((...sent: unknown[]) => fn(...((checks as Check<unknown>[]).map((check, i) => check(sent[i])) as Args))),
			);
		},
		served: (): ReadonlyMap<keyof Api & string, Route> => routes,
		/** Starts the table again: a registration is the whole of it, so registering again replaces it. */
		clear: (): void => routes.clear(),
	};
};

// The contract's calls, not its events (`onAgentLog`, ...), which `WorkspaceApi` has too: so narrowed to `InvokeName`.
const core = callTable<WorkspaceApi>();
/** Starts the core's table again: a registration is the whole of it (`registerCalls`), so registering again replaces it. */
export const clearRoutes = core.clear;
/** The core's calls registered, for the shell to serve. */
export const served = core.served as () => ReadonlyMap<InvokeName, Route>;
/** Answers the window's call `name` in the core's table (`callTable`). */
export const handle = core.handle as <K extends InvokeName, Args extends unknown[]>(
	name: K,
	checks: { [I in keyof Args]: Check<Args[I]> },
	fn: (...args: Args) => Answer<K> | Promise<Answer<K>>,
) => void;

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
	/** A prototype's name, its version: `v2`. */
	prototypeName: ((v) => {
		if (typeof v !== 'string') throw new Error('That is not a prototype.');
		assertPrototypeName(v);
		return v;
	}) as Check<string>,
	/** Codebase work's name: the one piece of work on a branch, so the one checked out, committed and shared from one. */
	codebaseName: ((v) => {
		if (v !== 'codebase') throw new Error(`"${String(v)}" is not codebase work: a version of a prototype is a page, not a branch.`);
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

/** How the core tells the window that `name` happened: the shell's (in VS Code, a message to its pages). */
export type EventSink = <K extends EventName>(name: K, payload: Payload<K>) => void;
