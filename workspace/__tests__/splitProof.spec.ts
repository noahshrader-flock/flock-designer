import { describe, expect, it } from 'vitest';
import type { EditedInCode } from '../src/shared/contract';
import { proveStacks } from '../src/core/services/designSystem/splitProof';
import { MOST_SPLIT, splitUnits } from '../src/core/services/designSystem/splitUnits';

/** Builds when every unit `needs` names is in the stack, as a typecheck sees all of a stack's files at once. */
const needing = (needs: Record<number, number[]>, whole = true) => {
	const asked: string[] = [];
	const builds = async (stack: number[], doing: string) => {
		asked.push(doing);
		if (!whole && stack.length === Object.keys(needs).length) return false;
		return stack.every((u) => (needs[u] ?? []).every((n) => stack.includes(n)));
	};
	return { builds, asked };
};
const name = (u: number) => `u${u}`;

describe('the stacks, from what builds', () => {
	it('puts each unit that builds alone on the design system’s branch', async () => {
		const { builds } = needing({ 0: [], 1: [], 2: [] });
		expect(await proveStacks(3, builds, name)).toEqual({ stacks: [0, 1, 2].map((unit) => ({ unit, on: null })) });
	});

	it('stands a unit on the one it needs, and a third on that, three deep', async () => {
		const { builds } = needing({ 0: [], 1: [0], 2: [1, 0], 3: [] });
		expect(await proveStacks(4, builds, name)).toEqual({
			stacks: [
				{ unit: 0, on: null },
				{ unit: 3, on: null },
				{ unit: 1, on: 0 },
				{ unit: 2, on: 1 },
			],
		});
	});

	it('stands a unit that needs two others on both, one stacked on the other', async () => {
		const { builds, asked } = needing({ 0: [], 1: [], 2: [0, 1] });
		expect(await proveStacks(3, builds, name)).toEqual({
			stacks: [
				{ unit: 0, on: null },
				{ unit: 1, on: 0 },
				{ unit: 2, on: 1 },
			],
		});
		expect(asked).toContain('u1, on u0');
		expect(asked.at(-1)).toBe('u2, on all the others');
	});

	it('refuses units that need each other, naming them', async () => {
		const { builds } = needing({ 0: [1], 1: [0], 2: [] });
		expect(await proveStacks(3, builds, name)).toEqual({ cycle: [0, 1] });
	});

	it('splits nothing when the whole change does not build', async () => {
		const { builds, asked } = needing({ 0: [], 1: [] }, false);
		expect(await proveStacks(2, builds, name)).toEqual({ whole: false });
		expect(asked).toEqual(['all of it together']);
	});
});

const EDITED: Extract<EditedInCode, { state: 'ready' }> = {
	state: 'ready',
	base: 'b'.repeat(40),
	components: [
		{ file: 'src/Button/Button.stories.tsx', files: [{ path: 'src/Button/Button.tsx', edit: 'changed' }] },
		{
			file: 'src/Chip/Chip.stories.tsx',
			files: [
				{ path: 'src/Chip/Chip.tsx', edit: 'changed' },
				{ path: 'src/Chip/package.json', edit: 'changed' },
			],
		},
	],
	unowned: [
		{ path: 'src/theme.ts', edit: 'changed' },
		{ path: 'package-lock.json', edit: 'changed' },
	],
	outside: [{ path: 'app/main.tsx', edit: 'changed' }],
};

describe('the units of a split', () => {
	it('is one a component, and the files in none their own, first, as the others stand on them', () => {
		const split = splitUnits(EDITED, new Map([['src/Button/Button.tsx', 12]]));
		expect('units' in split && split.units.map((u) => [u.file, u.files.map((f) => f.path)])).toEqual([
			[null, ['src/theme.ts']],
			['src/Button/Button.stories.tsx', ['src/Button/Button.tsx']],
			['src/Chip/Chip.stories.tsx', ['src/Chip/Chip.tsx']],
		]);
	});

	it('keeps what no one component’s reviewer could review in the branch, with why', () => {
		const split = splitUnits(EDITED, new Map());
		expect('units' in split && split.stays.map((s) => [s.file.path, s.why])).toEqual([
			['app/main.tsx', 'outside the design system'],
			['package-lock.json', 'a lockfile'],
			['src/Chip/package.json', 'the packages it installs'],
		]);
	});

	it('counts each unit’s lines, and flags one past what is read in one sitting', () => {
		const split = splitUnits(EDITED, new Map([['src/Button/Button.tsx', 301]]));
		const button = 'units' in split ? split.units.find((u) => u.file === 'src/Button/Button.stories.tsx') : undefined;
		expect(button).toMatchObject({ lines: 301, large: true });
	});

	it('gives each file in no component a pull request of its own, so two unrelated ones never seem to need each other', () => {
		const split = splitUnits({ ...EDITED, unowned: [...EDITED.unowned, { path: 'src/FSDrawerHeader/index.tsx', edit: 'changed' }] }, new Map());
		expect('units' in split && split.units.filter((u) => u.file === null).map((u) => u.files.map((f) => f.path))).toEqual([
			['src/theme.ts'],
			['src/FSDrawerHeader/index.tsx'],
		]);
	});

	it('does not split a change into more pull requests than can be shown to be one edit in each', () => {
		const many = Array.from({ length: MOST_SPLIT }, (_, i) => ({
			file: `src/C${i}/C${i}.stories.tsx`,
			files: [{ path: `src/C${i}/C${i}.tsx`, edit: 'changed' as const }],
		}));
		// Ten components and the shared theme file: eleven.
		expect(splitUnits({ ...EDITED, components: many }, new Map())).toEqual({ notSplit: MOST_SPLIT + 1 });
	});
});
