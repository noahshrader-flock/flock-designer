import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, watch } from 'node:fs';
import { join } from 'node:path';

const PAGE = /^(v\d+)\.html$/;

/** Long enough for a page of a few megabytes to be written, and for a save's own writes to be one change. */
export const SETTLE_MS = 400;

const hashOf = (file: string): string | null => {
	try {
		return createHash('sha1').update(readFileSync(file)).digest('hex');
	} catch {
		return null;
	}
};

/**
 * Tells `onPage` a version's page in `dir` (a project's `prototypes` folder) has changed, whoever changed it: the app, the
 * `dsnr` command run by an agent in another process, or a pull. The operating system says so, so nothing is polled; a change
 * is acted on once its writes have stopped, and only if the page is not what it was. Nothing to watch is nothing to say.
 */
export const watchPages = (dir: string, onPage: (name: string) => void, settleMs = SETTLE_MS): { close: () => void } => {
	const known = new Map<string, string>();
	const names = (): string[] => {
		try {
			return readdirSync(dir).flatMap((f) => PAGE.exec(f)?.[1] ?? []);
		} catch {
			return [];
		}
	};
	for (const name of names()) known.set(name, hashOf(join(dir, `${name}.html`)) ?? '');
	const timers = new Map<string, ReturnType<typeof setTimeout>>();
	const settle = (name: string) => {
		clearTimeout(timers.get(name));
		timers.set(
			name,
			setTimeout(() => {
				timers.delete(name);
				const now = hashOf(join(dir, `${name}.html`));
				if (now === null || now === known.get(name)) return;
				known.set(name, now);
				onPage(name);
			}, settleMs),
		);
	};
	let watcher: ReturnType<typeof watch> | null = null;
	try {
		watcher = watch(dir, { persistent: false }, (_event, file) => {
			// Some systems do not say which file: every page is looked at, and only one that changed is told.
			const name = file === null ? null : (PAGE.exec(String(file))?.[1] ?? null);
			if (name !== null) settle(name);
			else if (file === null) for (const each of names()) settle(each);
		});
		watcher.on('error', () => undefined);
	} catch {
		// A folder that is not there has no page to change.
	}
	return {
		close: () => {
			watcher?.close();
			for (const timer of timers.values()) clearTimeout(timer);
			timers.clear();
		},
	};
};
