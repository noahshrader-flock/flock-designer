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
	lines: async (_system, _base, tried, file) => {
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

export class ValueBranches extends ChangeBranches<TriedValue[]> {
	constructor(deps: ChangeBranchesDeps & { sources: Pick<ValueSources, 'of' | 'files'> }) {
		super(deps, VALUES(deps.sources));
	}
}
