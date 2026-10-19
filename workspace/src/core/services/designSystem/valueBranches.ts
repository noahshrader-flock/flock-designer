/**
 * The values tried on a component's instances, saved where they are found (Phase 4.4 of adjusting a component), on a
 * `dsnr/values-…` branch of the library kept for that component, as every change to the library is (`changeBranches.ts`).
 * What is written is what was found and read back while the values were tried (`ValueSources`), on the commit the library
 * is at: a change first saved on an older one is not saved on top of it.
 */
import type { TriedValue, ValuePlace } from '../../../shared/contract';
import { VALUE_NAMES, storyComponent } from '../../../shared/valueNames';
import { type ChangeBranchesDeps, ChangeBranches, type SavedKindRules } from './changeBranches';
import { libraryCommit } from './designLibrary';
import { type ValueSources, triedValuesOf } from './valueSources';

const VALUES = (sources: Pick<ValueSources, 'of' | 'files'>): SavedKindRules<TriedValue[]> => ({
	kind: 'values',
	branchWord: 'values',
	scope: 'component',
	check: triedValuesOf,
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
		// Nothing tried says nothing: the save is the library's own again.
		if (tried.length === 0) return [];
		const found = await sources.of(file, tried);
		if (found.state !== 'ready') throw new Error('Where the values are written is still being found; save once it is.');
		return tried.flatMap((t, i) => {
			const source = found.values[i];
			if (source?.state !== 'found') return [];
			// What the agent wrote is said as written by it (its lines are code, not a value), and what it is for.
			const what =
				source.by !== 'agent'
					? (p: ValuePlace) => `${p.written} → ${p.writes}`
					: () => (t.follows === undefined ? `${t.value}, written by the agent` : `follows ${t.follows}, written by the agent`);
			return source.places.map((p) => `${storyComponent(file)} · ${VALUE_NAMES[t.property]}: ${what(p)} (${p.file}, line ${p.line})`);
		});
	},
	subject: 'Component values',
	asItWas: 'back as the library draws them',
	about: 'Values of a component’s own, changed and tried on its instances in DSNR, each written where it was found to draw.',
	checked: 'Each was read back before it was saved: the stories drawn with it draw what was asked. Each commit is one save.',
	saving: 'save component values',
});

/** Each component's values, kept on its own branch, by the component's story file (`scope`). */
export class ValueBranches extends ChangeBranches<TriedValue[]> {
	constructor(deps: ChangeBranchesDeps & { sources: Pick<ValueSources, 'of' | 'files'> }) {
		super(deps, VALUES(deps.sources));
	}
}
