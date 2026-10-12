import { type BrowserWindow, ipcMain } from 'electron';
import { type Answer, type EventName, type InvokeName, type Payload, type Result, eventChannel, invokeChannel } from '../shared/contract';
import { asRecord } from '../shared/json';
import { isPrototypeName } from '../shared/prototypeNames';
import { fail, ok } from '../shared/result';
import { isSafeBranchName } from './services/git';
import { assertUsableProjectId } from './services/iterations';
import { assertPrototypeName } from './services/prototype';

/**
 * How the main process meets the window: each call registered by its name in the contract's table, its answer checked
 * against `WorkspaceApi`, and each event sent by name with the payload its listener expects.
 *
 * A handler returns its answer or throws a sentence for a person; it never returns a Result itself. An exception
 * crossing IPC arrives as a shapeless string, which is how a real problem turns into "something went wrong", so this is
 * the one place a throw becomes a Result.
 */

const guard =
	<Args extends unknown[], T>(fn: (...args: Args) => Promise<T> | T) =>
	async (_event: Electron.IpcMainInvokeEvent, ...args: Args): Promise<Result<T>> => {
		try {
			return ok(await fn(...args));
		} catch (err) {
			return fail(err);
		}
	};

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
): void =>
	ipcMain.handle(
		invokeChannel(name),
		guard((...sent: unknown[]) => fn(...((checks as Check<unknown>[]).map((check, i) => check(sent[i])) as Args))),
	);

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
	commentId: ((v) => {
		if (typeof v !== 'number' || !Number.isSafeInteger(v) || v <= 0) throw new Error('That is not a comment.');
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

/** Tells the window that `name` happened. */
export const emit = <K extends EventName>(window: BrowserWindow, name: K, payload: Payload<K>): void =>
	window.webContents.send(eventChannel(name), payload);
