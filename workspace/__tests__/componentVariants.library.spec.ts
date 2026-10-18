import { expect, it } from 'vitest';
import { typeLibs } from '../src/core/services/componentProps';
import { ComponentVariants } from '../src/core/services/componentVariants';
import type { ComponentVariants as Answer, ConnectedDesignSystem } from '../src/shared/contract';
import { findChrome } from '../src/core/services/chromeHeadless';
import { REAL_PRIMER_SYSTEM, libraryUnbuilt, primerMissing, REAL_FUI } from './realCheckouts';
import { settledAnswer } from './fixtures';
import { describeLibrary, onRealLibrary } from './realLibrary';

const settled = (v: ComponentVariants, file: string): Promise<Answer> =>
	settledAnswer(
		() => v.of(file),
		(a) => a.state === 'building',
		{ within: 240_000 },
	);

/**
 * On the real libraries on this machine: what their stories do not show, drawn from their props, as Values read it. FSBadge's
 * page also draws its stories as it opens, and what it is asked to draw after must be what is drawn.
 */
const onReal = (system: ConnectedDesignSystem, check: (of: (file: string) => Promise<Answer>) => Promise<void>) =>
	onRealLibrary(system, (real) => {
		const v = new ComponentVariants({ ...real, typeLibs: typeLibs(), folder: () => system.folder });
		return check((file) => settled(v, file));
	});
/** A row of a component's variants, by property: each cell's variant and value. */
const rowOf = (a: Answer, property: string) => {
	const rows = a.state === 'ready' && a.values.state === 'read' ? (a.values.rows.light ?? []) : [];
	return Object.fromEntries((rows.find((r) => r.property === property)?.cells ?? []).map((c) => [c.variant, c.value]));
};

describeLibrary(libraryUnbuilt, REAL_FUI, 'on Flock’s FUI', () => {
	it.skipIf(findChrome() === null)('draws FSChip’s sizes, FSBadge’s dot and FSTextField’s sizes, which MUI declares, from their props', async () => {
		await onReal(REAL_FUI, async (of) => {
			const file = (name: string) => `src/components/${name}/${name}.stories.tsx`;
			expect(rowOf(await of(file('FSChip')), 'height')).toEqual({ medium: '32px', small: '24px', tiny: '16px' });
			const badge = await of(file('FSBadge'));
			expect(badge).toMatchObject({ state: 'ready', fixed: [] });
			expect(rowOf(badge, 'height')).toMatchObject({ dot: '8px', standard: '20px' });
			expect(rowOf(await of(file('FSTextField')), 'height')).toMatchObject({ small: '40px', medium: '56px', search: '48px' });
		});
	});
});

describeLibrary(primerMissing, REAL_PRIMER_SYSTEM, 'on Primer React', () => {
	it.skipIf(findChrome() === null)('draws Label’s sizes on the story that takes its props, not the one that sets them itself', async () => {
		const system = REAL_PRIMER_SYSTEM;
		await onReal(system, async (of) => {
			const label = await of('packages/react/src/Label/Label.stories.tsx');
			expect(label).toMatchObject({ state: 'ready', fixed: [] });
			expect(rowOf(label, 'height')).toEqual({ small: '20px', large: '24px' });
		});
	});
});
