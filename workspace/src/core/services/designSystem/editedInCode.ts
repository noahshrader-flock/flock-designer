/**
 * What the person has changed in the design system's code, read from their checkout each time it is asked and never
 * written to: nothing is staged, checked out or fetched. Against where their branch left the design system's (the
 * merge-base with `origin/<branch>`), so the design system moving on since adds nothing of its own.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ConnectedDesignSystem, EditedComponent, EditedFile, EditedInCode } from '../../../shared/contract';
import { componentOwners } from './componentOwners';
import { filesOf } from './designSystems';
import { DSNR_BRANCH } from './dsnrBranch';
import { fileAt, git, mergeTexts } from '../platform/git';

/** Every file the base has, read once a base: a poll asks it again and again while the person works. */
const listed = new Map<string, { base: string; files: Promise<string[]> }>();
const filesAt = (root: string, base: string): Promise<string[]> => {
	const kept = listed.get(root);
	if (kept?.base === base) return kept.files;
	const files = git(root, ['ls-tree', '-r', '-z', '--name-only', base], { trim: false }).then((out) => out.split('\0').filter(Boolean));
	listed.set(root, { base, files });
	files.catch(() => listed.get(root)?.files === files && listed.delete(root));
	return files;
};

/** `git diff -z --name-status`: a status, then its path, or two for a move (`R`). */
const parseDiff = (out: string): EditedFile[] => {
	const parts = out.split('\0');
	const edited: EditedFile[] = [];
	for (let i = 0; i < parts.length - 1;) {
		const status = parts[i++]!;
		if (status.startsWith('R')) {
			edited.push({ path: parts[i + 1]!, edit: 'moved', from: parts[i]! });
			i += 2;
		} else {
			edited.push({ path: parts[i++]!, edit: status === 'A' ? 'added' : status === 'D' ? 'deleted' : 'changed' });
		}
	}
	return edited;
};

const byPath = (a: EditedFile, b: EditedFile): number => a.path.localeCompare(b.path);

export const editedInCode = async (system: ConnectedDesignSystem): Promise<EditedInCode> => {
	const { root, branch, folder } = system;
	// DSNR's own branch checked out (an agent's hand-over) is shown as that hand-over, not as the person's edits.
	const head = await git(root, ['rev-parse', '--abbrev-ref', 'HEAD']).catch(() => null);
	if (head === null || DSNR_BRANCH.test(head)) return { state: 'none' };
	const base = await git(root, ['merge-base', 'HEAD', `refs/remotes/origin/${branch}`]).catch(() => null);
	if (base === null) return { state: 'none' };
	const [diff, untracked] = await Promise.all([
		git(root, ['diff', '-z', '--name-status', '-M', base], { trim: false }),
		git(root, ['ls-files', '-z', '--others', '--exclude-standard'], { trim: false }),
	]);
	const edited = [
		...parseDiff(diff),
		...untracked
			.split('\0')
			.filter(Boolean)
			.map((path): EditedFile => ({ path, edit: 'added' })),
	];
	if (edited.length === 0) return { state: 'none' };
	// The design system's files, and its stories, as they were and as they are: a component the person added owns its files.
	const files = [...new Set([...(await filesAt(root, base)), ...edited.map((e) => e.path)])];
	const region = new Set(filesOf(files, folder));
	const owner = componentOwners([...region]);
	const components = new Map<string, EditedFile[]>();
	const unowned: EditedFile[] = [];
	const outside: EditedFile[] = [];
	const place = (file: EditedFile): void => {
		if (!region.has(file.path)) return void outside.push(file);
		const story = owner(file.path);
		if (story === null) unowned.push(file);
		else components.set(story, [...(components.get(story) ?? []), file]);
	};
	for (const e of edited) {
		// A file moved from one place to another is said in both: gone from the one, come to the other.
		if (e.edit === 'moved' && e.from !== undefined && (region.has(e.from) !== region.has(e.path) || owner(e.from) !== owner(e.path))) {
			place({ path: e.from, edit: 'moved', to: e.path });
			place({ path: e.path, edit: 'moved', from: e.from });
		} else place(e);
	}
	if (components.size === 0 && unowned.length === 0) return { state: 'none' };
	const changed: EditedComponent[] = [...components]
		.map(([file, edits]) => ({ file, files: edits.sort(byPath) }))
		.sort((a, b) => a.file.localeCompare(b.file));
	return { state: 'ready', base, components: changed, unowned: unowned.sort(byPath), outside: outside.sort(byPath) };
};

/** Null where the tip and the person both changed a file and git cannot put the two together, which is never guessed. */
const mergedOnTip = async (mine: string, base: string | null, now: string | null): Promise<string | null> => {
	// New in the person's branch; or there before and gone from the tip since.
	if (now === null) return base === null ? mine : null;
	// Added in both.
	if (base === null) return now === mine ? mine : null;
	return now === base ? mine : mergeTexts(base, mine, now);
};

/**
 * The person's files merged onto the tip the tab draws, never laid over it, which would undo what the tip gained since.
 * Said in words, with nothing drawn, for a file deleted, moved, not text, or changed on the tip in the same lines.
 */
export const editedOnTip = async (
	system: ConnectedDesignSystem,
	edited: Extract<EditedInCode, { state: 'ready' }>,
	tip: string,
): Promise<{ files: Map<string, string> } | { not: string }> => {
	const ours = [...edited.components.flatMap((c) => c.files), ...edited.unowned];
	const gone = ours.find((f) => f.edit === 'deleted' || f.edit === 'moved');
	if (gone) return { not: `${gone.path} is ${gone.edit === 'deleted' ? 'deleted' : 'moved'}, and the drawing can only change files.` };
	const files = new Map<string, string>();
	for (const { path } of ours) {
		const [bytes, base, now] = await Promise.all([
			readFile(join(system.root, path)),
			fileAt(system.root, edited.base, path),
			fileAt(system.root, tip, path),
		]);
		// Git's own test for a file that is not text: a zero byte.
		if (bytes.includes(0)) return { not: `${path} is not text, and the drawing can only change text files.` };
		const merged = await mergedOnTip(bytes.toString('utf8'), base?.text ?? null, now?.text ?? null);
		if (merged === null) return { not: `${path} has changed on ${system.branch} since your branch left it, in the same lines as yours.` };
		files.set(path, merged);
	}
	return { files };
};
