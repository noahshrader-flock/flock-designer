/**
 * The pull requests a split of the person's edits would make: one a component, and each file in none its own, with the
 * ones that need it stacked on it. Never one for all such files: two unrelated ones would then seem to need each other.
 */
import type { EditedFile, EditedInCode, SplitUnit } from '../../../shared/contract';
import { LARGE, classifyPath } from '../../../shared/processChanges';

/** Past this many pull requests DSNR cannot show the change is one edit made in each, so a person proposes it whole. */
export const MOST_SPLIT = 10;

/** Made, or about the whole repository: no one component's reviewer could review it, so it stays in the branch. */
const STAYS = new Set(['a lockfile', 'the packages it installs', 'the repository’s CI and settings', 'a generated file', 'the Storybook set-up']);

const unit = (file: string | null, files: EditedFile[], lines: ReadonlyMap<string, number>): SplitUnit => {
	const counted = files.reduce((n, f) => n + (lines.get(f.path) ?? 0), 0);
	return { file, files, lines: counted, large: files.length > LARGE.files || counted > LARGE.lines };
};

export const splitUnits = (
	edited: Extract<EditedInCode, { state: 'ready' }>,
	lines: ReadonlyMap<string, number>,
): { units: SplitUnit[]; stays: { file: EditedFile; why: string }[] } | { notSplit: number } => {
	const stays = edited.outside.map((file) => ({ file, why: 'outside the design system' }));
	const carried = (files: EditedFile[]) =>
		files.filter((file) => {
			const kind = classifyPath(file.path);
			if (kind === null || !STAYS.has(kind)) return true;
			stays.push({ file, why: kind });
			return false;
		});
	const shared = carried(edited.unowned).map((f) => unit(null, [f], lines));
	const units = [...shared, ...edited.components.map((c) => unit(c.file, carried(c.files), lines)).filter((u) => u.files.length > 0)];
	return units.length > MOST_SPLIT ? { notSplit: units.length } : { units, stays };
};
