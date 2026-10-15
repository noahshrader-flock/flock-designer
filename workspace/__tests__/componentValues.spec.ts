import { describe, expect, it } from 'vitest';
import type { Drawn, Instance } from '../src/main/services/componentTokens';
import { readValues } from '../src/main/services/componentValues';
import type { Tags } from '../src/main/services/tokenTags';
import type { DesignToken, ValueRow } from '../src/shared/contract';

/**
 * A component's drawn values (Phase 1 of adjusting a component): each instance its stories draw, as the library has it and
 * with every token tagged, read into rows by property, each told apart by the prop that explains it, and each value said to
 * be a token's, the component's own, or worked out from one. Against fixtures; the page that reads them is drawn in real
 * Chrome in `componentValues.integration.spec.ts`. Values come as the page reads them: each side and corner as it is.
 */

const BASE = {
	height: '36px',
	padding: '0px 10px 0px 10px',
	radius: '8px 8px 8px 8px',
	gap: 'normal normal',
	fontSize: '16px',
	background: 'rgba(0, 0, 0, 0)',
	text: 'rgb(16, 128, 98)',
};
const instance = (props: Record<string, string>, values: Partial<Instance['values']> = {}, story = 'Default'): Instance => ({
	story,
	props,
	values: { ...BASE, ...values },
});
const drawn = (instances: Instance[], more: Partial<Drawn> = {}): Drawn => ({
	colors: {},
	radii: {},
	spacing: {},
	component: true,
	instances,
	...more,
});
/** Spacing tagged 13px, the radius 17px, a height-sized length 23px; one color tag. */
const TAGS: Tags = {
	edits: [{ path: 'spacing', value: '13px' }],
	colors: new Map([['#00015A', 'palette.light.primary.main']]),
	sizes: [
		{ px: 13, path: 'spacing' },
		{ px: 17, path: 'shape.borderRadius' },
		{ px: 23, path: 'size.control' },
	],
	unmarked: 0,
};
/** A library with no token that could be tagged. */
const NO_TAGS: Tags = { edits: [], colors: new Map(), sizes: [], unmarked: 0 };
const SIZES = ['sm', 'md', 'lg', 'xl'];
const HEIGHTS = ['28px', '36px', '48px', '56px'];
/** Each size drawn in two stories, each instance with an id of its own: a prop with a value for every instance. */
const sized = (more: (i: number) => Partial<Instance['values']> = () => ({})) =>
	['AllSizes', 'Combinations'].flatMap((story, s) =>
		SIZES.map((size, i) => instance({ size, testId: `b${s}${i}` }, { height: HEIGHTS[i], ...more(i) }, story)),
	);
const rowOf = (rows: ValueRow[], property: ValueRow['property']) => rows.find((r) => r.property === property);
/** The tokens: primary in light and dark, written in two places, with the colour tag given to the light one. */
const TOKENS = [
	{
		path: 'palette.light.primary.main',
		group: 'Light',
		set: 'primary',
		name: 'main',
		kind: 'color',
		category: 'Color',
		value: '#108062',
		source: { file: 'light.ts', line: 1 },
	},
	{
		path: 'palette.dark.primary.main',
		group: 'Dark',
		set: 'primary',
		name: 'main',
		kind: 'color',
		category: 'Color',
		value: '#2bb48a',
		source: { file: 'light.ts', line: 1 },
	},
] as unknown as DesignToken[];
/** Read in light, from a drawing as the library has it and one with the tags; dark too, when its drawings are given. */
const readIn = (
	light: [Instance[], Instance[] | null],
	dark?: [Instance[], Instance[] | null],
	tags: Tags = TAGS,
	controls?: string[],
	tokens = TOKENS,
) => {
	const side = ([plain, tagged]: [Instance[], Instance[] | null]) => ({
		plain: drawn(plain, controls ? { controls } : {}),
		tagged: tagged === null ? null : drawn(tagged),
	});
	return readValues(side(light), dark && side(dark), tags, tokens);
};
const read = (plain: Instance[], tagged: Instance[] | null, tags: Tags = TAGS, controls?: string[]) => {
	const r = readIn([plain, tagged], undefined, tags, controls);
	if (r.state !== 'read') throw new Error(`not read: ${r.state}`);
	return { ...r, rows: r.rows.light as ValueRow[] };
};
const cells = (rows: ValueRow[], property: ValueRow['property']) => rowOf(rows, property)?.cells.map((c) => [c.variant, c.value, c.kind]);

describe('a component’s drawn values', () => {
	it('say why there are none: reading failed, no component named, none drawn, each only wraps what it is given, or its stories threw', () => {
		const said = (more: Partial<Drawn>) => readValues({ plain: drawn([], more), tagged: null }, undefined, TAGS, TOKENS);
		expect(said({ instancesFailed: 'boom' })).toEqual({ state: 'failed', error: 'boom' });
		expect(said({ component: false })).toEqual({ state: 'no-component' });
		expect(said({})).toEqual({ state: 'none-drawn' });
		expect(said({ wrapping: 2 })).toEqual({ state: 'wraps' });
		// None drawn because its stories threw is not none drawn: they say why, where they are.
		expect(said({ storiesFailed: 3 })).toEqual({ state: 'not-drawn' });
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
		expect(rowOf(read(plain, plain, NO_TAGS, ['variant', 'size']).rows, 'background')?.by).toBe('variant');
		// With no controls named, a prop with a different value on every instance in the file is taken for an id, not a variant.
		expect(rowOf(read(plain, plain, NO_TAGS).rows, 'background')?.by).toBe(null);
		// Controls named that the instances were not drawn with (a story file whose args name only its children) are as none.
		expect(rowOf(read(sized(), sized(), NO_TAGS, ['children']).rows, 'height')?.by).toBe('size');
	});

	it('give a value every instance draws once, for all, said short, and name the token it is when its tag shows through', () => {
		const r = read(
			sized(),
			sized(() => ({ radius: '17px 17px 17px 17px' })),
		);
		expect(rowOf(r.rows, 'radius')).toEqual({
			property: 'radius',
			by: null,
			cells: [{ variant: null, value: '8px', kind: 'token', tokens: ['shape.borderRadius'], instances: 8 }],
		});
	});

	it('read a color token by its tag, at any opacity; one the tags change into no tag as worked out from one; a clear one as none', () => {
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
			{ variant: 'primary', value: 'rgb(16, 128, 98)', kind: 'token', tokens: ['palette.light.primary.main'], instances: 1 },
			{ variant: 'hover', value: 'rgb(10, 100, 80)', kind: 'derived', tokens: [], instances: 1 },
			{ variant: 'ghost', value: 'none', kind: 'own', tokens: [], instances: 1 },
		]);
	});

	it('read a length of several parts part by part: all a token’s is the token, some is mixed, and a zero says nothing', () => {
		const plain = [instance({ size: 'sm' }, { padding: '0px 10px 0px 10px' }), instance({ size: 'lg' }, { padding: '8px 10px 8px 10px' })];
		const tagged = [instance({ size: 'sm' }, { padding: '0px 26px 0px 26px' }), instance({ size: 'lg' }, { padding: '8px 26px 8px 26px' })];
		expect(rowOf(read(plain, tagged, TAGS, ['size']).rows, 'padding')?.cells).toEqual([
			{ variant: 'sm', value: '0px 10px', kind: 'token', tokens: ['spacing'], instances: 1 },
			{ variant: 'lg', value: '8px 10px', kind: 'mixed', tokens: ['spacing'], instances: 1 },
		]);
	});

	it('never call a height a token, even when the tags move it onto a multiple of one: it is a sum, worked out from what is inside it', () => {
		const plain = [instance({ size: 'sm' }, { height: '28px' }), instance({ size: 'lg' }, { height: '48px' })];
		// Its padding tagged, sm's height comes to 46px, twice the 23px tag; lg's is a literal the tags leave alone.
		const tagged = [instance({ size: 'sm' }, { height: '46px' }), instance({ size: 'lg' }, { height: '48px' })];
		expect(cells(read(plain, tagged, TAGS, ['size']).rows, 'height')).toEqual([
			['sm', '28px', 'derived'],
			['lg', '48px', 'own'],
		]);
	});

	it('check no font size, and nothing at all when the two drawings do not pair up, by count, story or props', () => {
		expect(rowOf(read(sized(), sized()).rows, 'fontSize')?.cells[0]?.kind).toBe('unchecked');
		const kinds = (r: ReturnType<typeof read>) => [...new Set(r.rows.flatMap((row) => row.cells.map((c) => c.kind)))];
		expect(kinds(read(sized(), sized().slice(1)))).toEqual(['unchecked']);
		// As many instances in the same stories, but drawn with other props: not each other's twins.
		const other = sized().map((i) => ({ ...i, props: { ...i.props, size: 'xl' } }));
		expect(kinds(read(sized(), other))).toEqual(['unchecked']);
	});

	it('call every value the component’s own when no token could be tagged, except a font size, and carry how many lengths could not be', () => {
		const r = read(sized(), null, { ...NO_TAGS, unmarked: 3 });
		expect(rowOf(r.rows, 'height')?.cells.every((c) => c.kind === 'own')).toBe(true);
		expect(rowOf(r.rows, 'fontSize')?.cells[0]?.kind).toBe('unchecked');
		expect(r.unmarked).toBe(3);
	});

	it('read dark as light is read, with its own drawings: a colour is the Dark token written where the light one is', () => {
		const lightPlain = [instance({ variant: 'primary' }, { background: 'rgb(16, 128, 98)' })];
		const lightTagged = [instance({ variant: 'primary' }, { background: 'rgb(0, 1, 90)' })];
		const darkPlain = [instance({ variant: 'primary' }, { background: 'rgb(43, 180, 138)' })];
		const darkTagged = [instance({ variant: 'primary' }, { background: 'rgb(0, 1, 90)' })];
		const r = readIn([lightPlain, lightTagged], [darkPlain, darkTagged], TAGS, ['variant']);
		if (r.state !== 'read') throw new Error(r.state);
		expect(r.rows.light?.find((x) => x.property === 'background')?.cells[0]).toMatchObject({
			value: 'rgb(16, 128, 98)',
			tokens: ['palette.light.primary.main'],
		});
		// The tag is given once, as Light; in dark it names the Dark token, and the value is dark's own.
		expect(r.rows.dark?.find((x) => x.property === 'background')?.cells[0]).toMatchObject({
			value: 'rgb(43, 180, 138)',
			kind: 'token',
			tokens: ['palette.dark.primary.main'],
		});
	});

	it('say a value is its own in dark that is a token in light, and one that only differs in dark: each mode on its own drawings', () => {
		const light = [instance({ variant: 'primary' }, { background: 'rgb(16, 128, 98)', height: '36px' })];
		const lightTagged = [instance({ variant: 'primary' }, { background: 'rgb(0, 1, 90)', height: '36px' })];
		// Dark draws a literal where light draws a token: the tags change nothing there.
		const dark = [instance({ variant: 'primary' }, { background: 'rgb(30, 30, 30)', height: '40px' })];
		const r = readIn([light, lightTagged], [dark, dark], TAGS, ['variant']);
		if (r.state !== 'read') throw new Error(r.state);
		expect(r.rows.light?.find((x) => x.property === 'background')?.cells[0]?.kind).toBe('token');
		expect(r.rows.dark?.find((x) => x.property === 'background')?.cells[0]?.kind).toBe('own');
		expect(r.rows.dark?.find((x) => x.property === 'height')?.cells[0]?.value).toBe('40px');
	});

	it('have no dark values for a file whose stories drew nothing in dark, and say light all the same', () => {
		const r = readIn([sized(), sized()], undefined, TAGS, ['size']);
		if (r.state !== 'read') throw new Error(r.state);
		expect(r.rows.dark).toBeNull();
		expect(r.rows.light?.length).toBeGreaterThan(0);
	});

	it('leave out a property no instance draws anything of: no gap, no background, no border', () => {
		expect(read(sized(), sized()).rows.map((r) => r.property)).toEqual(['height', 'padding', 'radius', 'fontSize', 'text']);
	});

	it('tell values apart by two props together when no one prop does, read as a person would, the false one left out', () => {
		const plain = [
			instance({ variant: 'primary', disabled: 'false' }, { background: 'rgb(16, 128, 98)' }),
			instance({ variant: 'primary', disabled: 'false' }, { background: 'rgb(16, 128, 98)' }),
			instance({ variant: 'primary', disabled: 'true' }, { background: 'rgb(200, 200, 200)' }),
			instance({ variant: 'danger', disabled: 'false' }, { background: 'rgb(186, 26, 26)' }),
			instance({ variant: 'danger', disabled: 'true' }, { background: 'rgb(200, 200, 200)' }),
		];
		const row = rowOf(read(plain, plain, NO_TAGS, ['variant', 'disabled']).rows, 'background');
		expect(row?.by).toBe('variant, disabled');
		expect(row?.cells.map((c) => [c.variant, c.value])).toEqual([
			['primary', 'rgb(16, 128, 98)'],
			['primary · disabled', 'rgb(200, 200, 200)'],
			['danger', 'rgb(186, 26, 26)'],
			['danger · disabled', 'rgb(200, 200, 200)'],
		]);
	});

	it('name no two props when each of their combinations is drawn once: then they would explain anything', () => {
		const plain = [
			instance({ variant: 'primary', dense: 'false' }, { height: '40px' }),
			instance({ variant: 'primary', dense: 'true' }, { height: '36px' }),
			instance({ variant: 'ghost', dense: 'false' }, { height: '36px' }),
			instance({ variant: 'ghost', dense: 'true' }, { height: '28px' }),
		];
		expect(rowOf(read(plain, plain, NO_TAGS, ['variant', 'dense']).rows, 'height')?.by).toBe(null);
	});

	it('say a prop an instance was drawn without as not set, since it draws the default; and a true or false prop alone by its name', () => {
		const plain = [instance({ size: 'sm' }, { height: '28px' }), instance({ size: 'lg' }, { height: '48px' }), instance({}, { height: '48px' })];
		expect(cells(read(plain, plain, NO_TAGS, ['size']).rows, 'height')).toEqual([
			['sm', '28px', 'own'],
			['lg', '48px', 'own'],
			['not set', '48px', 'own'],
		]);
		const alone = [instance({ disabled: 'true' }, { background: 'rgb(200, 200, 200)' }), instance({ disabled: 'false' })];
		expect(rowOf(read(alone, alone, NO_TAGS, ['disabled']).rows, 'background')?.cells.map((c) => c.variant)).toEqual(['disabled', 'not disabled']);
	});

	it('make one of two variants that read the same once shortened and draw the same, and say both in full when they draw differently', () => {
		const same = [
			instance({ variant: 'primary' }, { background: 'rgb(16, 128, 98)' }),
			instance({ variant: 'primary', disabled: 'false' }, { background: 'rgb(16, 128, 98)' }),
			instance({ variant: 'primary', disabled: 'true' }, { background: 'rgb(200, 200, 200)' }),
			instance({ variant: 'ghost', disabled: 'true' }, { background: 'rgb(200, 200, 200)' }),
			instance({ variant: 'ghost', disabled: 'true' }, { background: 'rgb(200, 200, 200)' }),
			instance({ variant: 'ghost' }),
		];
		expect(rowOf(read(same, same, NO_TAGS, ['variant', 'disabled']).rows, 'background')?.cells.map((c) => [c.variant, c.instances])).toEqual([
			['primary', 2],
			['primary · disabled', 1],
			['ghost · disabled', 2],
			['ghost', 1],
		]);
		const differ = [
			instance({ variant: 'primary' }, { height: '40px' }),
			instance({ variant: 'primary' }, { height: '40px' }),
			instance({ variant: 'primary', dense: 'false' }, { height: '36px' }),
			instance({ variant: 'secondary' }, { height: '36px' }),
			instance({ variant: 'secondary', dense: 'true' }, { height: '28px' }),
		];
		expect(rowOf(read(differ, differ, NO_TAGS, ['variant', 'dense']).rows, 'height')?.cells.map((c) => c.variant)).toEqual([
			'primary · not set',
			'primary · false',
			'secondary · not set',
			'secondary · true',
		]);
	});

	it('list each distinct value with how many draw it when no prop explains them, most drawn first', () => {
		const plain = [
			instance({}, { height: '40px' }, 'A'),
			instance({}, { height: '40px' }, 'B'),
			instance({}, { height: '44px' }, 'C'),
			instance({}, { height: '40px' }, 'D'),
		];
		expect(rowOf(read(plain, plain, NO_TAGS).rows, 'height')).toEqual({
			property: 'height',
			by: null,
			cells: [
				{ variant: null, value: '40px', kind: 'own', tokens: [], instances: 3 },
				{ variant: null, value: '44px', kind: 'own', tokens: [], instances: 1 },
			],
		});
	});
});
