import { describe, expect, it } from 'vitest';
import { VALUE_PROPERTIES, type ValueCell, type ValueRow } from '../src/shared/contract';
import { GROUPS, firstSelection, inspect, optionLabel, pickersOf, propLabel, rowName, shownFor } from '../src/shared/inspector';

/**
 * A component's values as an inspector reads them (INSPECTOR_PLAN Phase 1): the variant shown chosen by a picker for each prop
 * its rows are told apart by, and each row's value for it, in groups. Cases as the real library draws them: one prop (Height by
 * size, with a size drawn without), two (Background by variant and disabled, not set and false alike), and none.
 */

const cell = (variant: string | null, value: string, of?: Record<string, string | null>[]): ValueCell => ({
	variant,
	value,
	kind: 'own',
	tokens: [],
	instances: 1,
	targets: [`${variant}`],
	...(of ? { of } : {}),
});
const HEIGHT: ValueRow = {
	property: 'height',
	by: 'size',
	cells: [cell('sm', '28px', [{ size: 'sm' }]), cell('lg', '48px', [{ size: 'lg' }]), cell('not set', '48px', [{ size: null }])],
};
const BACKGROUND: ValueRow = {
	property: 'background',
	by: 'variant, disabled',
	cells: [
		cell('primary', '#108062', [
			{ variant: 'primary', disabled: null },
			{ variant: 'primary', disabled: 'false' },
		]),
		cell('primary · disabled', '#C8C8C8', [{ variant: 'primary', disabled: 'true' }]),
		cell('ghost', 'none', [{ variant: 'ghost', disabled: null }]),
	],
};
const RADIUS: ValueRow = { property: 'radius', by: null, cells: [cell(null, '8px')] };
// Told apart by no prop: the value most instances draw first, as the rows are.
const CHIP: ValueRow = { property: 'border', by: null, cells: [cell(null, '#111111'), cell(null, '#222222'), cell(null, '#333333')] };
const ROWS = [HEIGHT, RADIUS, BACKGROUND, CHIP];

describe('the inspector of a component’s values', () => {
	it('has a group for every property a value can be of, each property in one', () => {
		expect(
			GROUPS.flatMap((g) => g.properties)
				.slice()
				.sort(),
		).toEqual([...VALUE_PROPERTIES].sort());
	});

	it('offers a picker for each prop its rows are told apart by, its values in the order drawn, a true or false one as a switch', () => {
		const pickers = pickersOf(ROWS);
		expect(pickers).toEqual([
			{ prop: 'size', options: ['sm', 'lg', null], switch: false },
			{ prop: 'variant', options: ['primary', 'ghost'], switch: false },
			{ prop: 'disabled', options: [null, 'false', 'true'], switch: true },
		]);
		// It opens on each prop's first value, and a switch off.
		expect(firstSelection(pickers)).toEqual({ size: 'sm', variant: 'primary', disabled: 'false' });
		expect([optionLabel(null), optionLabel('lg'), propLabel('size')]).toEqual(['default', 'lg', 'Size']);
		// A row is named as the Values name it, but Text's color, in a group called Text.
		expect([rowName('padding'), rowName('text')]).toEqual(['Padding', 'Text color']);
		// A component whose values are the same for every instance has none.
		expect(pickersOf([RADIUS, CHIP])).toEqual([]);
	});

	it('shows each row’s value for the variant chosen: by one prop, by two, a default, and a switch off as false or not set alike', () => {
		const pickers = pickersOf(ROWS);
		expect(shownFor(HEIGHT, pickers, { size: 'lg' })).toEqual({ cell: HEIGHT.cells[1], more: [], still: false });
		expect(shownFor(HEIGHT, pickers, { size: null })).toEqual({ cell: HEIGHT.cells[2], more: [], still: false });
		expect(shownFor(BACKGROUND, pickers, { variant: 'primary', disabled: 'false' })).toEqual({ cell: BACKGROUND.cells[0], more: [], still: false });
		expect(shownFor(BACKGROUND, pickers, { variant: 'primary', disabled: null })).toEqual({ cell: BACKGROUND.cells[0], more: [], still: false });
		expect(shownFor(BACKGROUND, pickers, { variant: 'primary', disabled: 'true' })).toEqual({ cell: BACKGROUND.cells[1], more: [], still: false });
		// The same for every instance: its one value, whatever is chosen.
		expect(shownFor(RADIUS, pickers, { size: 'lg' })).toEqual({ cell: RADIUS.cells[0], more: [], still: false });
	});

	it('says a combination no story drew is not drawn, with the nearest that was, and never guesses one', () => {
		const pickers = pickersOf(ROWS);
		// Ghost was never drawn disabled.
		expect(shownFor(BACKGROUND, pickers, { variant: 'ghost', disabled: 'true' })).toEqual({ cell: null, nearest: BACKGROUND.cells[1] });
	});

	it('shows a row no prop explains by the value most instances draw, with the others', () => {
		expect(shownFor(CHIP, [], {})).toEqual({ cell: CHIP.cells[0], more: CHIP.cells.slice(1), still: false });
	});

	it('takes a case only the props declare from their drawing, shown and never tried: its stories drew no xl, its props did', () => {
		// Every variant's drawing: each declared size drawn on one story.
		const DECLARED: ValueRow[] = [
			{
				property: 'height',
				by: 'size',
				cells: [cell('sm', '28px', [{ size: 'sm' }]), cell('xl', '56px', [{ size: 'xl' }])],
			},
			{ property: 'gap', by: null, cells: [cell(null, '4px')] },
		];
		const pickers = pickersOf([...ROWS, ...DECLARED]);
		expect(pickers[0]).toEqual({ prop: 'size', options: ['sm', 'lg', null, 'xl'], switch: false });
		const shown = (size: string | null) => inspect(ROWS, pickers, { ...firstSelection(pickers), size }, DECLARED)[0]?.rows;
		// Where its stories drew it, theirs, which can be tried; xl only from its props, still.
		expect(shown('sm')?.map((r) => [r.row.property, r.shown])).toEqual([
			['height', { cell: HEIGHT.cells[0], more: [], still: false }],
			['gap', { cell: DECLARED[1]?.cells[0], more: [], still: true }],
		]);
		expect(shown('xl')?.[0]?.shown).toEqual({ cell: DECLARED[0]?.cells[1], more: [], still: true });
	});

	it('lays the rows out in their groups, in order, and leaves out a group with nothing in it', () => {
		const pickers = pickersOf(ROWS);
		const groups = inspect(ROWS, pickers, firstSelection(pickers));
		expect(groups.map((g) => [g.name, g.rows.map((r) => r.row.property)])).toEqual([
			['Layout', ['height']],
			['Appearance', ['radius']],
			['Fill', ['background']],
			['Stroke', ['border']],
		]);
	});
});
