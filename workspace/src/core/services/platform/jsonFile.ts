import { mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
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
	// Read, changed and written under the file's lock, so two windows' DSNR changing it at once do not lose either change.
	return { read, write, update: (change) => locked(path, () => write(change(read()))) };
};

/** How long a lock may be held before it is taken as left by a DSNR that stopped while holding it. */
const STALE_MS = 5_000;
/** How long a change waits for the lock before it goes ahead regardless: a choice forgotten is an inconvenience, never a failure. */
const WAIT_MS = 2_000;
const pause = (ms: number) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/** `work`, holding `<path>.lock`, a file only one process can make; one left longer than `STALE_MS` is taken over. */
const locked = (path: string, work: () => void): void => {
	const lock = `${path}.lock`;
	try {
		mkdirSync(dirname(path), { recursive: true });
	} catch {
		return work();
	}
	for (const until = Date.now() + WAIT_MS; ; pause(20)) {
		try {
			writeFileSync(lock, String(process.pid), { flag: 'wx' });
			break;
		} catch (err) {
			if ((err as NodeJS.ErrnoException).code !== 'EEXIST' || Date.now() > until) return work();
			try {
				if (Date.now() - statSync(lock).mtimeMs > STALE_MS) rmSync(lock, { force: true });
			} catch {
				// Gone since: tried again.
			}
		}
	}
	try {
		work();
	} finally {
		rmSync(lock, { force: true });
	}
};

/** A file's text, or null when it is not there or cannot be read. */
export const readText = (path: string): string | null => {
	try {
		return readFileSync(path, 'utf8');
	} catch {
		return null;
	}
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
