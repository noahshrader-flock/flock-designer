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
const mergedOnTip = async (
	mine: Buffer,
	base: { text: string; sha: string } | null,
	now: { text: string; sha: string } | null,
): Promise<Buffer | null> => {
	// New in the person's branch; or there before and gone from the tip since.
	if (now === null) return base === null ? mine : null;
	// Added in both.
	if (base === null) return now.text === mine.toString('utf8') ? mine : null;
	if (now.sha === base.sha) return mine;
	// Git's own test for a file that is not text: a zero byte. Such a file changed on both sides is not merged.
	if (mine.includes(0)) return null;
	const merged = await mergeTexts(base.text, mine.toString('utf8'), now.text);
	return merged === null ? null : Buffer.from(merged);
};

/**
 * The person's `files` merged onto the tip (`tip`), never laid over it, which would undo what the tip gained since: each
 * as it would be there, or null where it is gone (deleted, or moved away). Said in words, with nothing merged, for one the
 * tip has changed in the same lines.
 */
export const changesOnTip = async (
	system: ConnectedDesignSystem,
	edited: Extract<EditedInCode, { state: 'ready' }>,
	tip: string,
	files: EditedFile[],
): Promise<{ files: Map<string, Buffer | null> } | { not: string }> => {
	// A file moved to another component is that one's to add: here it is only gone.
	const movedAway = new Set([...edited.components.flatMap((c) => c.files), ...edited.unowned].filter((f) => f.to !== undefined).map((f) => f.path));
	const on = new Map<string, Buffer | null>();
	for (const f of files) {
		if (f.edit === 'deleted' || f.to !== undefined) {
			on.set(f.path, null);
			continue;
		}
		const was = f.from ?? f.path;
		if (f.from !== undefined && !movedAway.has(f.from)) on.set(f.from, null);
		const [mine, base, now, there] = await Promise.all([
			readFile(join(system.root, f.path)),
			fileAt(system.root, edited.base, was),
			fileAt(system.root, tip, was),
			f.from === undefined ? null : fileAt(system.root, tip, f.path),
		]);
		if (there !== null) return { not: `${f.path} is on ${system.branch} now too, and yours is moved there from ${f.from}.` };
		const merged = await mergedOnTip(mine, base, now);
		if (merged === null) return { not: `${f.path} has changed on ${system.branch} since your branch left it, in the same lines as yours.` };
		on.set(f.path, merged);
	}
	return { files: on };
};

/** As `changesOnTip`, for drawing: a drawing only changes text files, so one deleted, moved or not text is said, not drawn. */
export const editedOnTip = async (
	system: ConnectedDesignSystem,
	edited: Extract<EditedInCode, { state: 'ready' }>,
	tip: string,
): Promise<{ files: Map<string, string> } | { not: string }> => {
	const ours = [...edited.components.flatMap((c) => c.files), ...edited.unowned];
	const gone = ours.find((f) => f.edit === 'deleted' || f.edit === 'moved');
	if (gone) return { not: `${gone.path} is ${gone.edit === 'deleted' ? 'deleted' : 'moved'}, and the drawing can only change files.` };
	const on = await changesOnTip(system, edited, tip, ours);
	if ('not' in on) return on;
	const files = new Map<string, string>();
	for (const [path, bytes] of on.files) {
		if (bytes === null || bytes.includes(0)) return { not: `${path} is not text, and the drawing can only change text files.` };
		files.set(path, bytes.toString('utf8'));
	}
	return { files };
};

/** Lines added and removed in each file, as a pull request counts them; a new file not yet in git, by its own lines. */
export const editedLines = async (system: ConnectedDesignSystem, edited: Extract<EditedInCode, { state: 'ready' }>): Promise<Map<string, number>> => {
	const parts = (await git(system.root, ['diff', '-z', '--numstat', '-M', edited.base], { trim: false })).split('\0');
	const lines = new Map<string, number>();
	// `added\tremoved\tpath`, or for a move `added\tremoved\t` then its old path and its new.
	for (let i = 0; i < parts.length - 1; i++) {
		const [added = '', removed = '', path = ''] = parts[i]!.split('\t');
		const counted = (Number(added) || 0) + (Number(removed) || 0);
		if (path !== '') lines.set(path, counted);
		else {
			lines.set(parts[i + 2]!, counted);
			i += 2;
		}
	}
	const all = [...edited.components.flatMap((c) => c.files), ...edited.unowned, ...edited.outside];
	for (const f of all.filter((e) => e.edit === 'added' && !lines.has(e.path))) {
		const text = await readFile(join(system.root, f.path)).catch(() => null);
		const said = text === null || text.includes(0) ? '' : text.toString('utf8');
		lines.set(f.path, said === '' ? 0 : said.split('\n').length - (said.endsWith('\n') ? 1 : 0));
	}
	return lines;
};
