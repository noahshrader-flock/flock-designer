/**
 * The values tried on a component's instances, saved where they are found (Phase 4.4 of adjusting a component), on a
 * `dsnr/values-…` branch of the library kept for that component, as every change to the library is (`changeBranches.ts`).
 * What is written is what was found and read back while the values were tried (`ValueSources`), on the commit the library
 * is at: a change first saved on an older one is not saved on top of it.
 */
import type { TriedValue } from '../../shared/contract';
import { VALUE_NAMES } from '../../shared/valueNames';
import { type ChangeBranchesDeps, ChangeBranches, type ChangeKind } from './changeBranches';
import { libraryCommit } from './designLibrary';
import { type ValueSources, triedValuesOf } from './valueSources';

/** A component, as a save names it: its story file's name (`FSButton.stories.tsx` is FSButton). */
const componentOf = (file: string): string => (file.split('/').pop() ?? file).replace(/\.stories\.[^.]+$/, '');

const VALUES = (sources: Pick<ValueSources, 'of' | 'files'>): ChangeKind<TriedValue[]> => ({
	kind: 'values',
	parse: (saved) => {
		try {
			return triedValuesOf(saved);
		} catch {
			return null;
		}
	},
	empty: (tried) => tried.length === 0,
	files: async (system, base, tried, file) => {
		if ((await libraryCommit(system.root, system.branch)) !== base)
			throw new Error(
				'The library has moved since this was first saved, so it is not saved on top of it: start over to save it on the library as it is now.',
			);
		return sources.files(file, tried);
	},
	// Each place written, as the tab says it: the component, the value, what it was and is, and where.
	lines: async (_system, _base, tried, file) => {
		const found = await sources.of(file, tried);
		if (found.state !== 'ready') throw new Error('Where the values are written is still being found; save once it is.');
		return tried.flatMap((t, i) => {
			const source = found.values[i];
			return source?.state === 'found'
				? source.places.map((p) => `${componentOf(file)} · ${VALUE_NAMES[t.property]}: ${p.written} → ${p.writes} (${p.file}, line ${p.line})`)
				: [];
		});
	},
	commit: (lines) => [`Component values: ${lines.length} changed`, '', ...lines, '', 'Saved from DSNR.'].join('\n'),
	proposal: (lines) => ({
		title: `Component values: ${lines[0]?.split(':')[0] ?? 'a change'}${lines.length > 1 ? ` and ${lines.length - 1} more` : ''}`,
		body: [
			'Values of a component’s own, changed and tried on its instances in DSNR, each written where it was found to draw.',
			'',
			...lines.map((l) => `- ${l}`),
			'',
			'Each was read back before it was saved: the stories drawn with it draw what was asked. Each commit is one save.',
			'',
			'_Opened by DSNR as a draft._',
		].join('\n'),
	}),
	saving: 'save component values',
});

/** Each component's values, kept on its own branch, by the component's story file (`scope`). */
export class ValueBranches extends ChangeBranches<TriedValue[]> {
	constructor(deps: ChangeBranchesDeps & { sources: Pick<ValueSources, 'of' | 'files'> }) {
		super(deps, VALUES(deps.sources));
	}
}
