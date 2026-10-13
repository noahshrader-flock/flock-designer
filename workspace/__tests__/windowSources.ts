import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const workspace = join(__dirname, '..');

/**
 * The window's own components, as text, for the guards that hold a rule across every screen: every `.tsx` in the window
 * and the published page's viewer, apart from shadcn's own `ui/`, by its path from the workspace. `except` leaves out the
 * files that are the one place a thing is made.
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

/** The screens a rule finds broken: the paths of those whose text matches `rule`, `except` the files it is made in. */
export const offenders = (rule: RegExp, ...except: string[]): string[] =>
	windowSources(...except)
		.filter(({ text }) => rule.test(text))
		.map((f) => f.path);

/**
 * Each opening tag of an element named by `names` (`/^(Button|button)$/`), read to its closing `>` outside any `{…}`, so a
 * `>` in an arrow function or a comparison does not end it, and with the text that follows it (`after`, a little of it).
 */
export const tags = (text: string, names: RegExp): { tag: string; after: string }[] => {
	const found: { tag: string; after: string }[] = [];
	for (const m of text.matchAll(/<([A-Za-z][\w.]*)\b/g)) {
		if (!names.test(m[1]!)) continue;
		let depth = 0;
		for (let i = m.index ?? 0; i < text.length; i++) {
			const c = text[i];
			if (c === '{') depth++;
			else if (c === '}') depth--;
			else if (c === '>' && depth === 0) {
				found.push({ tag: text.slice(m.index ?? 0, i + 1), after: text.slice(i + 1, i + 201) });
				break;
			}
		}
	}
	return found;
};

/** Every tag of `names`, in every screen, that breaks `rule` (given the tag and what follows it), as `path: tag`. */
export const badTags = (names: RegExp, rule: (tag: string, after: string) => boolean, ...except: string[]): string[] =>
	windowSources(...except).flatMap(({ path, text }) =>
		tags(text, names)
			.filter(({ tag, after }) => rule(tag, after))
			.map(({ tag }) => `${path}: ${tag.replace(/\s+/g, ' ').slice(0, 90)}`),
	);
