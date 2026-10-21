/**
 * Which component a file of the design system's is part of, from where its stories are: no import is followed and nothing
 * is run, so it holds for any layout.
 */
import { basename, dirname } from 'node:path';
import { storyComponent } from '../../../shared/valueNames';
import { isScript, isStoryFile } from './componentCatalog';

const named = (path: string): string =>
	basename(path)
		.replace(/\.[^.]+$/, '')
		.toLowerCase();
/** `Tooltip.features.stories.tsx` is Tooltip's. */
const storyOf = (story: string): string => storyComponent(story).split('.')[0]!.toLowerCase();

/**
 * A folder is a component's when a story is named for it, or its one story holds no other's beneath (Primer's `src/` has
 * one, above eighty). Stories kept apart (`stories/`) own the one folder with a file of their name; two, or none, is no one's.
 */
export const componentOwners = (files: string[]): ((path: string) => string | null) => {
	const byFolder = new Map<string, string[]>();
	for (const f of files.filter(isStoryFile)) byFolder.set(dirname(f), [...(byFolder.get(dirname(f)) ?? []), f]);
	const holdsOthers = (folder: string): boolean => [...byFolder.keys()].some((d) => d !== folder && (folder === '.' || d.startsWith(`${folder}/`)));
	const folders = new Map<string, string>();
	const apart: string[] = [];
	for (const [folder, stories] of byFolder) {
		const own =
			stories.find((s) => storyOf(s) === basename(folder).toLowerCase()) ?? (stories.length === 1 && !holdsOthers(folder) ? stories[0] : undefined);
		if (own !== undefined) folders.set(folder, own);
		else apart.push(...stories);
	}
	const byName = new Map<string, Set<string>>();
	for (const f of files) {
		if (!isScript(f) || isStoryFile(f) || /\.(test|spec)\./.test(f) || /^index\./.test(basename(f))) continue;
		byName.set(named(f), (byName.get(named(f)) ?? new Set()).add(dirname(f)));
	}
	const storyFolder = new Map<string, string>();
	for (const story of apart) {
		const found = [...(byName.get(storyOf(story)) ?? [])];
		if (found.length !== 1 || holdsOthers(found[0]!)) continue;
		storyFolder.set(story, found[0]!);
		if (!folders.has(found[0]!)) folders.set(found[0]!, story);
	}
	const deepestFirst = [...folders.keys()].sort((a, b) => b.length - a.length);
	return (path) => {
		const folder = storyFolder.get(path) ?? deepestFirst.find((d) => d === '.' || path.startsWith(`${d}/`));
		return folder === undefined ? null : (folders.get(folder) ?? null);
	};
};
