import type { Project } from './contract';
import { capitalize } from './titleCase';

/** A project's title, the name people see, is its brief's first heading, read and written only here; never its id. */
const HEADING = /^#\s+(.+?)\s*$/;

export const firstHeading = (markdown: string): string | null => {
	for (const line of markdown.split('\n')) {
		const m = HEADING.exec(line);
		if (m?.[1]) return m[1];
	}
	return null;
};

/** As a title is kept: on one line, its spaces single; null when nothing is left. */
export const projectTitle = (v: string): string | null => {
	const title = v.replace(/\s+/g, ' ').trim();
	return title === '' ? null : title;
};

/** The brief with `title` as its first heading, in place of the one it had, or after its front matter when it had none. */
export const withTitle = (markdown: string, title: string): string => {
	const lines = markdown.split('\n');
	const at = lines.findIndex((l) => HEADING.test(l));
	if (at !== -1) return [...lines.slice(0, at), `# ${title}`, ...lines.slice(at + 1)].join('\n');
	const m = FRONT_MATTER.exec(markdown);
	const head = m ? m[0] : '';
	return `${head}# ${title}\n\n${markdown.slice(head.length)}`;
};

/** A project's folder is kept in its brief's front matter (`folder: Admin`), read and written only here; never in its id. */
const FRONT_MATTER = /^---\r?\n((?:.*\r?\n)*?)---\r?\n/;

const FOLDER_LINE = /^folder:(.*)$/;

export const folderName = (v: unknown): string | null => {
	if (typeof v !== 'string') return null;
	const name = v.replace(/\s+/g, ' ').trim().slice(0, 60).trim();
	return name === '' ? null : name;
};

const frontMatterOf = (markdown: string): { lines: string[]; body: string } => {
	const m = FRONT_MATTER.exec(markdown);
	return m ? { lines: (m[1] as string).split(/\r?\n/).filter((l) => l !== ''), body: markdown.slice(m[0].length) } : { lines: [], body: markdown };
};

export const briefFolder = (markdown: string): string | null => {
	const line = frontMatterOf(markdown).lines.find((l) => FOLDER_LINE.test(l));
	return line === undefined ? null : folderName(FOLDER_LINE.exec(line)?.[1]);
};

/** They may differ only by case. */
export const sameFolder = (a: string, b: string): boolean => a.localeCompare(b, undefined, { sensitivity: 'accent' }) === 0;

/** Each once whatever its case, as the first project in the list spells it. */
export const foldersOf = (projects: Project[]): string[] => {
	const folders: string[] = [];
	for (const p of projects) if (p.folder && !folders.some((f) => sameFolder(f, p.folder as string))) folders.push(p.folder);
	return folders.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
};

export type FolderChoice = { kind: 'all' } | { kind: 'none' } | { kind: 'folder'; name: string };

export const ALL_FOLDERS: FolderChoice = { kind: 'all' };

export const inFolder = (project: Project, choice: FolderChoice): boolean =>
	choice.kind === 'all' ? true : choice.kind === 'none' ? !project.folder : !!project.folder && sameFolder(project.folder, choice.name);

export const fromBrief = (projectId: string, brief: string | null): { title: string; folder: string | null } =>
	brief === null ? { title: projectId, folder: null } : { title: firstHeading(brief) ?? projectId, folder: briefFolder(brief) };

export const briefBody = (markdown: string): string => frontMatterOf(markdown).body;

/** Anything else in the front matter is kept, and a brief left with nothing in it is as it was before it had a folder. */
export const withFolder = (markdown: string, folder: string | null): string => {
	const { lines, body } = frontMatterOf(markdown);
	const name = folderName(folder);
	const others = lines.filter((l) => !FOLDER_LINE.test(l));
	const kept = name === null ? others : [...others, `folder: ${name}`];
	return kept.length === 0 ? body : `---\n${kept.join('\n')}\n---\n${body}`;
};

export const recordLabel = (name: string): string => {
	const words = name.replace(/\.[^.]+$/, '').replace(/-/g, ' ');
	return capitalize(words);
};
