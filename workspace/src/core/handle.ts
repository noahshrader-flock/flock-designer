import { type Answer, type CommentRef, type EventName, type InvokeName, type Payload, type Result, type WorkspaceApi } from '../shared/contract';
import { asRecord } from '../shared/json';
import { fail, ok } from '../shared/result';
import { isSafeBranchName } from './services/platform/git';
import { assertUsableProjectId } from './services/projects/workRecords';
import { assertPrototypeName } from './services/prototypes/prototype';

/** A handler throws a sentence for a person and this is the one place it becomes a Result: a throw crossing IPC arrives shapeless. */

const guard =
	<Args extends unknown[], T>(fn: (...args: Args) => Promise<T> | T) =>
	async (...args: Args): Promise<Result<T>> => {
		try {
			return ok(await fn(...args));
		} catch (err) {
			return fail(err);
		}
	};

/** What the window sent is untrusted; a Result out, never a throw. */
export type Route = (...sent: unknown[]) => Promise<Result<unknown>>;

/** Throws a sentence for a person saying why it will not. */
export type Check<T> = (value: unknown) => T;

export type AnswerOf<Api, K extends keyof Api> = Api[K] extends (...args: never[]) => Promise<Result<infer T>> ? T : never;

export const callTable = <Api>() => {
	const routes = new Map<keyof Api & string, Route>();
	return {
		/** Whatever the window sends is untrusted, and this is the one place it is checked, before `fn` sees it. */
		handle: <K extends keyof Api & string, Args extends unknown[]>(
			name: K,
			checks: { [I in keyof Args]: Check<Args[I]> },
			fn: (...args: Args) => AnswerOf<Api, K> | Promise<AnswerOf<Api, K>>,
		): void => {
			if (routes.has(name)) throw new Error(`${name} is answered twice.`);
			routes.set(
				name,
				guard((...sent: unknown[]) => fn(...((checks as Check<unknown>[]).map((check, i) => check(sent[i])) as Args))),
			);
		},
		served: (): ReadonlyMap<keyof Api & string, Route> => routes,
		clear: (): void => routes.clear(),
	};
};

// The contract's calls, not its events (`onAgentLog`, ...), which `WorkspaceApi` has too: so narrowed to `InvokeName`.
const core = callTable<WorkspaceApi>();
export const clearRoutes = core.clear;
export const served = core.served as () => ReadonlyMap<InvokeName, Route>;
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

export const arg = {
	/** A checkout's folder, as the window names it: still to be found among those the person opened. */
	root: text('a folder', 4096),
	projectId: ((v) => {
		if (typeof v !== 'string') throw new Error('That is not a project.');
		assertUsableProjectId(v);
		return v;
	}) as Check<string>,
	/** A prototype's name is its version: `v2`. */
	prototypeName: ((v) => {
		if (typeof v !== 'string') throw new Error('That is not a prototype.');
		assertPrototypeName(v);
		return v;
	}) as Check<string>,
	codebaseName: ((v) => {
		if (v !== 'codebase') throw new Error(`"${String(v)}" is not codebase work: a version of a prototype is a page, not a branch.`);
		return v;
	}) as Check<string>,
	branch: ((v) => {
		if (typeof v !== 'string' || !isSafeBranchName(v)) throw new Error(`"${String(v)}" is not a branch name.`);
		return v;
	}) as Check<string>,
	comment: ((v) => {
		const r = asRecord(v);
		if (![r.thread, r.id].every(isPositiveInteger)) throw new Error('That is not a comment.');
		return { thread: r.thread as number, id: r.id as number };
	}) as Check<CommentRef>,
	markerId: ((v) => {
		if (!isPositiveInteger(v)) throw new Error('That is not a comment.');
		return v;
	}) as Check<number>,
	flag: ((v) => v === true) as Check<boolean>,
	name: text('a name', 300),
	url: text('an address', 4096),
	/** Bounded, since they go into a task or a GitHub body. */
	words: text('text', 20_000),
	/** Passed on as sent, for a value the service checks itself (an anchor, token edits, a picture). */
	unknown: ((v) => v) as Check<unknown>,
	startingPoint: ((v) => {
		if (v === undefined || v === null) return null;
		const r = asRecord(v);
		return { root: arg.root(r.root), branch: arg.branch(r.branch) };
	}) as Check<{ root: string; branch: string } | null>,
	optional:
		<T>(check: Check<T>): Check<T | null> =>
		(v) =>
			v === undefined || v === null ? null : check(v),
};

export type EventSink = <K extends EventName>(name: K, payload: Payload<K>) => void;
