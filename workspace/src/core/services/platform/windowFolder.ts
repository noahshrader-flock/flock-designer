import { mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A folder of `root` for this window's DSNR alone. Each VS Code window runs its own DSNR, all sharing one storage folder, and
 * two building into one folder delete each other's builds (QUALITY_PASS finding 3). A window takes the first folder no
 * running DSNR holds, so one opened again uses the builds the last one kept, else a new one; each folder says, in its
 * `owner` file, which process holds it. Taking one over is a rename only one window can win.
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

export const windowFolder = (root: string, pid: number = process.pid, alive: (pid: number) => boolean = running): string => {
	mkdirSync(root, { recursive: true });
	// The builds of a version before this, made straight in `root`, which no window will use again.
	for (const old of readdirSync(root)) if (!SLOT.test(old)) rmSync(join(root, old), { recursive: true, force: true });
	for (let n = 1; ; n++) {
		const dir = join(root, `w${n}`);
		const owner = join(dir, 'owner');
		mkdirSync(dir, { recursive: true });
		const take = (): boolean => {
			try {
				writeFileSync(owner, String(pid), { flag: 'wx' });
				return true;
			} catch {
				return false;
			}
		};
		if (take()) return dir;
		const holder = Number(readFileSync(owner, 'utf8').trim());
		if (holder === pid) return dir;
		if (Number.isInteger(holder) && holder > 0 && alive(holder)) continue;
		// Its DSNR is gone: taken over by moving its note aside, which only one window can do.
		const aside = `${owner}.${pid}.gone`;
		try {
			renameSync(owner, aside);
		} catch {
			continue;
		}
		rmSync(aside, { force: true });
		if (take()) return dir;
	}
};
