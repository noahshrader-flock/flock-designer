import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const workspace = join(__dirname, '..');

/** `except` leaves out the files that are the one place a thing is made. */
export const windowSources = (...except: string[]): { path: string; text: string }[] => {
	const files = (dir: string): string[] =>
		readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? files(join(dir, n)) : n.endsWith('.tsx') ? [join(dir, n)] : []));
	return ['src/viewer']
		.flatMap((d) => files(join(workspace, d)))
		.map((f) => relative(workspace, f))
		.filter((path) => !except.some((e) => path.endsWith(e)))
		.map((path) => ({ path, text: readFileSync(join(workspace, path), 'utf8') }));
};
