import type { Project } from './contract';
import { capitalize } from './titleCase';

/** A project's brief, and the folders projects are put in by it: what a brief's front matter says and how it is shown. */

/** `# Title` from a brief, or null. The project id is used when there is none. */
export const firstHeading = (markdown: string): string | null => {
	for (const line of markdown.split('\n')) {
		const m = /^#\s+(.+?)\s*$/.exec(line);
		if (m?.[1]) return m[1];
	}
	return null;
};

/**
 * A project's **folder** (the folders plan): a label, kept in its brief's front matter, a `---` block at the very top:
 *
 *     ---
 *     folder: Admin
 *     ---
 *     # Alert history
 *
 * Read and written only here, so where the folder is kept can change in one place. A project id never holds its folder.
 */
const FRONT_MATTER = /^---\r?\n((?:.*\r?\n)*?)---\r?\n/;

const FOLDER_LINE = /^folder:(.*)$/;

/** A folder's name as it is kept: trimmed, runs of spaces made one, at most 60 characters; null when nothing is left. */
export const folderName = (v: unknown): string | null => {
	if (typeof v !== 'string') return null;
	const name = v.replace(/\s+/g, ' ').trim().slice(0, 60).trim();
	return name === '' ? null : name;
};

/** The lines of a brief's front matter, and the rest of the brief after it; no lines when it has none. */
const frontMatterOf = (markdown: string): { lines: string[]; body: string } => {
	const m = FRONT_MATTER.exec(markdown);
	return m ? { lines: (m[1] as string).split(/\r?\n/).filter((l) => l !== ''), body: markdown.slice(m[0].length) } : { lines: [], body: markdown };
};

/** The folder a brief says its project is in, or null. */
export const briefFolder = (markdown: string): string | null => {
	const line = frontMatterOf(markdown).lines.find((l) => FOLDER_LINE.test(l));
	return line === undefined ? null : folderName(FOLDER_LINE.exec(line)?.[1]);
};

/** Whether two folder names are one folder: they differ, if at all, only by case. */
export const sameFolder = (a: string, b: string): boolean => a.localeCompare(b, undefined, { sensitivity: 'accent' }) === 0;

/** The folders projects are in, each once whatever its case (as the first project in the list spells it), in order. */
export const foldersOf = (projects: Project[]): string[] => {
	const folders: string[] = [];
	for (const p of projects) if (p.folder && !folders.some((f) => sameFolder(f, p.folder as string))) folders.push(p.folder);
	return folders.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
};

/** Which projects the Projects screen shows: every one, those in no folder, or one folder's. */
export type FolderChoice = { kind: 'all' } | { kind: 'none' } | { kind: 'folder'; name: string };

export const ALL_FOLDERS: FolderChoice = { kind: 'all' };

/** Whether a project is among those `choice` shows. */
export const inFolder = (project: Project, choice: FolderChoice): boolean =>
	choice.kind === 'all' ? true : choice.kind === 'none' ? !project.folder : !!project.folder && sameFolder(project.folder, choice.name);

/** What a project's brief says of it: its title (the brief's heading, or the id when there is none) and its folder. */
export const fromBrief = (projectId: string, brief: string | null): { title: string; folder: string | null } =>
	brief === null ? { title: projectId, folder: null } : { title: firstHeading(brief) ?? projectId, folder: briefFolder(brief) };

/** A brief as a person reads it: without its front matter. */
export const briefBody = (markdown: string): string => frontMatterOf(markdown).body;

/**
 * A brief with its project in `folder`, or in none for null: only the folder's line changes, anything else in the front
 * matter is kept, and a brief left with nothing in it is as it was before it had a folder.
 */
export const withFolder = (markdown: string, folder: string | null): string => {
	const { lines, body } = frontMatterOf(markdown);
	const name = folderName(folder);
	const others = lines.filter((l) => !FOLDER_LINE.test(l));
	const kept = name === null ? others : [...others, `folder: ${name}`];
	return kept.length === 0 ? body : `---\n${kept.join('\n')}\n---\n${body}`;
};

/** A project file as it reads in a menu: `design-notes.md` is "Design notes". */
export const recordLabel = (name: string): string => {
	const words = name.replace(/\.[^.]+$/, '').replace(/-/g, ' ');
	return capitalize(words);
};
