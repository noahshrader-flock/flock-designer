import type { Result } from './contract';

/**
 * What a call to the app answers with, made one way everywhere: the value, or a sentence for a person. A service throws
 * an Error with that sentence; this is how it becomes a Result.
 */
export const ok = <T>(value: T): Result<T> => ({ ok: true, value });
export const fail = (err: unknown): Result<never> => ({ ok: false, error: errorText(err) });
/** The value of `work`, or what went wrong: never a throw. */
export const toResult = <T>(work: Promise<T>): Promise<Result<T>> => work.then(ok, fail);

/** What an error says, as a person reads it; `firstLine` for a tool whose message runs on (git's, a build's). */
export const errorText = (err: unknown, { firstLine = false }: { firstLine?: boolean } = {}): string => {
	const text = err instanceof Error ? err.message : String(err);
	return firstLine ? (text.trim().split('\n')[0] ?? '') : text;
};
