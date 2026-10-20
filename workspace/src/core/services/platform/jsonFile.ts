import { mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/** A JSON file's object, read once; null when it is not there, cannot be read, or is not an object. */
export const readJsonObject = (path: string): Record<string, unknown> | null => {
	try {
		const v = JSON.parse(readFileSync(path, 'utf8')) as unknown;
		return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
	} catch {
		return null;
	}
};

/**
 * A small kept JSON file (a choice, a memory, a cache). One edited, damaged or from another version reads as `fallback`;
 * it is written whole, so no reader sees part of one; and a failed write is ignored, as forgetting a choice is no failure.
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

export const readText = (path: string): string | null => {
	try {
		return readFileSync(path, 'utf8');
	} catch {
		return null;
	}
};

/** Throws when it cannot, unlike `jsonFile`'s write, for a caller that must know. */
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
