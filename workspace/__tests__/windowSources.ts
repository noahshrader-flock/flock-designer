import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const workspace = join(__dirname, '..');

/**
 * The window's own components, as text, for the guards that hold a rule across every screen (`buttonStyles.spec`,
 * `dialogs.spec`): every `.tsx` in the window and the published page's viewer, apart from shadcn's own `ui/`, by its path
 * from the workspace. `except` leaves out the files that are the one place a thing is made.
 */
export const windowSources = (...except: string[]): { path: string; text: string }[] => {
	const files = (dir: string): string[] =>
		readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? files(join(dir, n)) : n.endsWith('.tsx') ? [join(dir, n)] : []));
	return ['src/renderer', 'src/viewer']
		.flatMap((d) => files(join(workspace, d)))
		.map((f) => relative(workspace, f))
		.filter((path) => !path.startsWith('src/renderer/ui/') && !except.some((e) => path.endsWith(e)))
		.map((path) => ({ path, text: readFileSync(join(workspace, path), 'utf8') }));
};
