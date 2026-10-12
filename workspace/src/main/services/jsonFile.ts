import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * A small JSON file the app keeps (a choice, a memory, a cache), the one way: read through a check of its own, so a file
 * that was edited, damaged or written by another version reads as `fallback`; written whole (to a file beside it, then
 * renamed over it), so a reader never sees part of one; and never failing the app when it cannot be written, since
 * forgetting a choice is an inconvenience, never a failure.
 */
export interface JsonFile<T> {
	read(): T;
	write(value: T): void;
	update(change: (current: T) => T): void;
}

export const jsonFile = <T>(path: string, { parse, fallback }: { parse: (raw: unknown) => T; fallback: T }): JsonFile<T> => {
	const read = (): T => {
		try {
			return parse(JSON.parse(readFileSync(path, 'utf8')) as unknown);
		} catch {
			return fallback;
		}
	};
	const write = (value: T): void => {
		try {
			writeAtomic(path, JSON.stringify(value));
		} catch {
			// Kept again next time.
		}
	};
	return { read, write, update: (change) => write(change(read())) };
};

/** Writes `data` whole: beside the file first, then renamed over it. Throws when it cannot, for a caller that must know. */
export const writeAtomic = (path: string, data: string | Buffer, mode?: number): void => {
	mkdirSync(dirname(path), { recursive: true });
	const next = `${path}.${process.pid}.new`;
	try {
		writeFileSync(next, data, mode === undefined ? undefined : { mode });
		renameSync(next, path);
	} catch (err) {
		rmSync(next, { force: true });
		throw err;
	}
};
