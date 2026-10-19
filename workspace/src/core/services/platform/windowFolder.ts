import { linkSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A folder of `root` for this window's DSNR alone: windows share one storage folder, and two building into one folder
 * delete each other's builds. A window takes the first folder no running DSNR holds, so one reopened reuses kept builds.
 */

/*
 * The newest turn, `owner-<n>` (naming its process), holds a folder. Taking one means making the next turn, which only
 * one window can do; a turn is linked into place once written, so none is read half written.
 */

/** Whether a process is running. A process of another user's answers that it is (EPERM). */
const running = (pid: number): boolean => {
	try {
		process.kill(pid, 0);
		return true;
	} catch (err) {
		return (err as NodeJS.ErrnoException).code === 'EPERM';
	}
};

const SLOT = /^w\d+$/;
const TURN = /^owner-(\d+)$/;

const turnsOf = (dir: string): number[] =>
	readdirSync(dir)
		.flatMap((name) => {
			const m = TURN.exec(name);
			return m ? [Number(m[1])] : [];
		})
		.sort((a, b) => a - b);

export const windowFolder = (root: string, pid: number = process.pid, alive: (pid: number) => boolean = running): string => {
	mkdirSync(root, { recursive: true });
	// The builds of a version before this, made straight in `root`, which no window will use again.
	for (const old of readdirSync(root)) if (!SLOT.test(old)) rmSync(join(root, old), { recursive: true, force: true });
	for (let slot = 1; ; slot++) {
		const dir = join(root, `w${slot}`);
		mkdirSync(dir, { recursive: true });
		const turns = turnsOf(dir);
		const newest = turns.at(-1);
		if (newest !== undefined) {
			const holder = Number(readFileSync(join(dir, `owner-${newest}`), 'utf8'));
			if (holder === pid) return dir;
			if (alive(holder)) continue;
		}
		const turn = join(dir, `owner-${(newest ?? 0) + 1}`);
		const mine = `${turn}.${pid}`;
		writeFileSync(mine, String(pid));
		try {
			linkSync(mine, turn);
		} catch {
			// Another window made it first: the folder is theirs.
			continue;
		} finally {
			rmSync(mine, { force: true });
		}
		// The turns before the last one are forgotten; the last is kept, so a window that read it gone as this one did finds
		// the turn it would make already taken.
		for (const old of turns.slice(0, -1)) rmSync(join(dir, `owner-${old}`), { force: true });
		return dir;
	}
};
