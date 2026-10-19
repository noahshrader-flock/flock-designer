import type { Result } from './contract';

/** A service throws an Error whose message is a sentence for a person; this is how it becomes a Result. */
export const ok = <T>(value: T): Result<T> => ({ ok: true, value });
export const fail = (err: unknown): Result<never> => ({ ok: false, error: errorText(err) });
export const valueOf = <T>(result: Result<T>): T => {
	if (!result.ok) throw new Error(result.error);
	return result.value;
};

export const toResult = <T>(work: Promise<T>): Promise<Result<T>> => work.then(ok, fail);

/** `firstLine` for a tool whose message runs on (git's, a build's). */
export const errorText = (err: unknown, { firstLine = false }: { firstLine?: boolean } = {}): string => {
	const text = err instanceof Error ? err.message : String(err);
	return firstLine ? (text.trim().split('\n')[0] ?? '') : text;
};
