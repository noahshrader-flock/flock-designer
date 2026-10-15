import { describe, expect, it } from 'vitest';
import type { Drawn, Instance, Tags } from '../src/main/services/componentTokens';
import { readValues } from '../src/main/services/componentValues';
import type { ValueRow } from '../src/shared/contract';

/**
 * A component's drawn values (Phase 1 of adjusting a component): each instance its stories draw, as the library has it and
 * with every token tagged, read into rows by property, each told apart by the prop that explains it, and each value said to
 * be a token's, the component's own, or worked out from one. Against fixtures; the page that reads them is drawn in real
 * Chrome in `componentValues.integration.spec.ts`.
 */

const BASE = {
	height: '36px',
	padding: '0px 10px',
	radius: '8px',
	gap: 'normal',
	fontSize: '16px',
	background: 'rgba(0, 0, 0, 0)',
	text: 'rgb(16, 128, 98)',
};
const instance = (props: Record<string, string>, values: Partial<Instance['values']> = {}, story = 'Default'): Instance => ({
	story,
	props,
	values: { ...BASE, ...values },
});
const drawn = (instances: Instance[], component = true, controls?: string[]): Drawn => ({
	colors: {},
	radii: {},
	spacing: {},
	component,
	instances,
	...(controls ? { controls } : {}),
});
/** Spacing tagged 13px, the radius 17px; one color tag. */
const TAGS: Tags = {
	edits: [],
	colors: new Map([['#00015A', 'palette.primary.main']]),
	sizes: [
		{ px: 13, path: 'spacing' },
		{ px: 17, path: 'shape.borderRadius' },
	],
};
const SIZES = ['sm', 'md', 'lg', 'xl'];
const HEIGHTS = ['28px', '36px', '48px', '56px'];
/** Each size drawn in two stories, each instance with an id of its own: a prop with a value for every instance. */
const sized = (more: (i: number) => Partial<Instance['values']> = () => ({})) =>
	['AllSizes', 'Combinations'].flatMap((story, s) =>
		SIZES.map((size, i) => instance({ size, testId: `b${s}${i}` }, { height: HEIGHTS[i], ...more(i) }, story)),
	);
const rowOf = (rows: ValueRow[], property: ValueRow['property']) => rows.find((r) => r.property === property);
const read = (plain: Instance[], tagged: Instance[] | null, tags: Tags | null = TAGS, controls?: string[]) => {
	const r = readValues(drawn(plain, true, controls), tagged === null ? null : drawn(tagged), tags);
	if (r.state !== 'read') throw new Error(`not read: ${r.state}`);
	return r;
};

describe('a component’s drawn values', () => {
	it('say so when its stories do not name their component, or draw none of it', () => {
		expect(readValues(drawn([], false), null, TAGS)).toEqual({ state: 'no-component' });
		expect(readValues(drawn([]), null, TAGS)).toEqual({ state: 'none-drawn' });
	});

	it('tell a value apart by the prop that explains it, in the order drawn, and not by a prop with a value for each instance', () => {
		const r = read(sized(), sized());
		expect(r.instances).toBe(8);
		expect(rowOf(r.rows, 'height')).toEqual({
			property: 'height',
			by: 'size',
			cells: SIZES.map((size, i) => ({ variant: size, value: HEIGHTS[i], kind: 'own', tokens: [], instances: 2 })),
		});
	});

	it('tell values apart by the props the stories name as controls, even where each is drawn once, and only by those', () => {
		const plain = ['primary', 'secondary', 'ghost'].map((variant, i) =>
			instance({ testId: `v${i}`, variant }, { background: ['rgb(16, 128, 98)', 'rgb(218, 240, 242)', 'rgba(0, 0, 0, 0)'][i] }),
		);
		const named = readValues(drawn(plain, true, ['variant', 'size']), drawn(plain), null);
		expect(named.state === 'read' && rowOf(named.rows, 'background')?.by).toBe('variant');
		// With no controls named, a prop with a value for every instance in the file is taken for an id, not a variant.
		const unnamed = readValues(drawn(plain), drawn(plain), null);
		expect(unnamed.state === 'read' && rowOf(unnamed.rows, 'background')?.by).toBe(null);
	});

	it('give a value every instance draws once, for all, and name the token it is when its tag shows through', () => {
		const r = read(
			sized(),
			sized(() => ({ radius: '17px' })),
		);
		expect(rowOf(r.rows, 'radius')).toEqual({
			property: 'radius',
			by: null,
			cells: [{ variant: null, value: '8px', kind: 'token', tokens: ['shape.borderRadius'], instances: 8 }],
		});
	});

	it('read a color token by its tag, at any opacity, and a color that changes with the tags but is none as worked out from one', () => {
		const plain = [
			instance({ variant: 'primary' }, { background: 'rgb(16, 128, 98)' }),
			instance({ variant: 'hover' }, { background: 'rgb(10, 100, 80)' }),
			instance({ variant: 'ghost' }),
		];
		const tagged = [
			instance({ variant: 'primary' }, { background: 'rgba(0, 1, 90, 0.5)' }),
			instance({ variant: 'hover' }, { background: 'rgb(0, 1, 70)' }),
			instance({ variant: 'ghost' }),
		];
		expect(rowOf(read(plain, tagged, TAGS, ['variant']).rows, 'background')?.cells).toEqual([
			{ variant: 'primary', value: 'rgb(16, 128, 98)', kind: 'token', tokens: ['palette.primary.main'], instances: 1 },
			{ variant: 'hover', value: 'rgb(10, 100, 80)', kind: 'derived', tokens: [], instances: 1 },
			{ variant: 'ghost', value: 'none', kind: 'own', tokens: [], instances: 1 },
		]);
	});

	it('read a value of several parts part by part: all a token’s is the token, some is mixed, and a zero says nothing', () => {
		const plain = [instance({ size: 'sm' }, { padding: '0px 10px' }), instance({ size: 'lg' }, { padding: '8px 10px' })];
		const tagged = [instance({ size: 'sm' }, { padding: '0px 26px' }), instance({ size: 'lg' }, { padding: '8px 26px' })];
		expect(rowOf(read(plain, tagged, TAGS, ['size']).rows, 'padding')?.cells).toEqual([
			{ variant: 'sm', value: '0px 10px', kind: 'token', tokens: ['spacing'], instances: 1 },
			{ variant: 'lg', value: '8px 10px', kind: 'mixed', tokens: ['spacing'], instances: 1 },
		]);
	});

	it('check no font size, and nothing at all when the two drawings do not pair up', () => {
		expect(rowOf(read(sized(), sized()).rows, 'fontSize')?.cells[0]?.kind).toBe('unchecked');
		const r = read(sized(), sized().slice(1));
		expect(r.rows.flatMap((row) => row.cells.map((c) => c.kind))).toEqual(r.rows.flatMap((row) => row.cells.map(() => 'unchecked')));
	});

	it('call every value the component’s own when the library has no token to tag, except a font size', () => {
		const r = read(sized(), null, null);
		expect(rowOf(r.rows, 'height')?.cells.every((c) => c.kind === 'own')).toBe(true);
		expect(rowOf(r.rows, 'fontSize')?.cells[0]?.kind).toBe('unchecked');
	});

	it('leave out a property no instance draws anything of: no gap, no background, no border', () => {
		const properties = read(sized(), sized()).rows.map((r) => r.property);
		expect(properties).toEqual(['height', 'padding', 'radius', 'fontSize', 'text']);
	});

	it('tell values apart by two props together when no one prop does, named in the order drawn', () => {
		const plain = [
			instance({ variant: 'primary', disabled: 'false' }, { background: 'rgb(16, 128, 98)' }),
			instance({ variant: 'primary', disabled: 'true' }, { background: 'rgb(200, 200, 200)' }),
			instance({ variant: 'danger', disabled: 'false' }, { background: 'rgb(186, 26, 26)' }),
			instance({ variant: 'danger', disabled: 'true' }, { background: 'rgb(200, 200, 200)' }),
		];
		const row = rowOf(read(plain, plain).rows, 'background');
		expect(row?.by).toBe('variant, disabled');
		// Read as a person would: a prop that is true by its name, and one that is false left out.
		expect(row?.cells.map((c) => [c.variant, c.value])).toEqual([
			['primary', 'rgb(16, 128, 98)'],
			['primary · disabled', 'rgb(200, 200, 200)'],
			['danger', 'rgb(186, 26, 26)'],
			['danger · disabled', 'rgb(200, 200, 200)'],
		]);
	});

	it('say a prop an instance was drawn without as not set, since it draws the default', () => {
		const plain = [instance({ size: 'sm' }, { height: '28px' }), instance({ size: 'lg' }, { height: '48px' }), instance({}, { height: '48px' })];
		expect(rowOf(read(plain, plain, TAGS, ['size']).rows, 'height')?.cells.map((c) => [c.variant, c.value])).toEqual([
			['sm', '28px'],
			['lg', '48px'],
			['not set', '48px'],
		]);
	});

	it('say a true or false prop alone by its name, and leave a variant as it is when shortening it would make two read the same', () => {
		const alone = [
			instance({ disabled: 'true' }, { background: 'rgb(200, 200, 200)' }),
			instance({ disabled: 'false' }),
			instance({ disabled: 'true' }, { background: 'rgb(200, 200, 200)' }),
		];
		expect(rowOf(read(alone, alone, null, ['disabled']).rows, 'background')?.cells.map((c) => c.variant)).toEqual(['disabled', 'not disabled']);
		// Two props are needed here, and shortening would make "primary" twice: they are left as they are.
		const both = [
			instance({ variant: 'primary' }, { height: '40px' }),
			instance({ variant: 'primary', dense: 'false' }, { height: '36px' }),
			instance({ variant: 'secondary' }, { height: '36px' }),
			instance({ variant: 'secondary', dense: 'true' }, { height: '28px' }),
		];
		const row = rowOf(read(both, both, null, ['variant', 'dense']).rows, 'height');
		expect(row?.by).toBe('variant, dense');
		expect(row?.cells.map((c) => c.variant)).toEqual(['primary · not set', 'primary · false', 'secondary · not set', 'secondary · true']);
	});

	it('make one of two variants that read the same once shortened and draw the same: not set and false draw the default alike', () => {
		const plain = [
			instance({ variant: 'primary' }, { background: 'rgb(16, 128, 98)' }),
			instance({ variant: 'primary', disabled: 'false' }, { background: 'rgb(16, 128, 98)' }),
			instance({ variant: 'primary', disabled: 'true' }, { background: 'rgb(200, 200, 200)' }),
			instance({ variant: 'ghost', disabled: 'true' }, { background: 'rgb(200, 200, 200)' }),
			instance({ variant: 'ghost' }),
		];
		expect(rowOf(read(plain, plain, null, ['variant', 'disabled']).rows, 'background')?.cells.map((c) => [c.variant, c.instances])).toEqual([
			['primary', 2],
			['primary · disabled', 1],
			['ghost · disabled', 1],
			['ghost', 1],
		]);
	});

	it('list each distinct value with how many draw it when no prop explains them, most drawn first', () => {
		const plain = [
			instance({}, { height: '40px' }, 'A'),
			instance({}, { height: '40px' }, 'B'),
			instance({}, { height: '44px' }, 'C'),
			instance({}, { height: '40px' }, 'D'),
		];
		expect(rowOf(read(plain, plain).rows, 'height')).toEqual({
			property: 'height',
			by: null,
			cells: [
				{ variant: null, value: '40px', kind: 'own', tokens: [], instances: 3 },
				{ variant: null, value: '44px', kind: 'own', tokens: [], instances: 1 },
			],
		});
	});
});
