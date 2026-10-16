import { beforeEach, describe, expect, it } from 'vitest';
import { reachOf } from '../src/main/services/changeReach';
import type { Built, Drawn, Instance, Measure } from '../src/main/services/componentTokens';
import type { CatalogReads } from '../src/main/services/componentCatalog';
import { MOST_PLACES, ValueSources } from '../src/main/services/valueSources';
import type { ComponentValues, TriedValue, ValueSources as Answer } from '../src/shared/contract';

/**
 * Where a value tried on a component's instances is written (Phase 4), against a library drawn by a rule this test knows:
 * a size table gives each Button size its height, a CSS module gives a Badge its radius and padding, and what is drawn is
 * read from the files each build is given. So which places move what is known, and each answer can be checked exactly.
 */
const BUTTON = 'src/Button/Button.stories.tsx';
const BADGE = 'src/Badge/Badge.stories.tsx';

const LIBRARY: Record<string, string> = {
	'src/theme.ts': [
		'export const sizes = {', //
		"  sm: { height: '28px' },",
		"  md: { height: '36px' },",
		'};',
		"export const minimum = { width: '28px' };",
	].join('\n'),
	'src/Badge/Badge.module.css': '.badge {\n  border-radius: 20px;\n  padding: 2px 6px;\n}\n',
	'src/Badge/Badge.tsx': "export const color = '#fff';\n",
	// Not where anything is written: a story, and a test.
	[BUTTON]: "export const Sm = () => <Button size='sm' style={{ height: '28px' }} />;",
	'src/Button/Button.test.tsx': "expect(height).toBe('28px');",
};

/** How this library draws: each Button by its size's height (the larger, written twice), at least 26px tall; each Badge by its module's radius and padding. */
const draw = (files: Record<string, string>, file: string): Drawn => {
	const of = (text: string | undefined, pattern: RegExp) => (text === undefined ? undefined : pattern.exec(text)?.[1]);
	// A size written twice draws the larger: so either, alone, can move it.
	const largest = (text: string | undefined, pattern: RegExp) =>
		`${Math.max(...[...(text ?? '').matchAll(pattern)].map((m) => parseFloat(m[1] as string)))}px`;
	const at = (n: string | undefined) => `${Math.max(26, parseFloat(n ?? '0'))}px`;
	const instances: Instance[] =
		file === BUTTON
			? [
					...['Sm#1', 'Sm#2'].map((key) => ({
						story: 'Sm',
						key,
						props: { size: 'sm' },
						// With a package's own button in place of the second, its height is the package's.
						values: {
							height:
								key === 'Sm#2' && 'src/Button/fromPackage.ts' in files ? '28px' : at(largest(files['src/theme.ts'], /sm: \{ height: '([^']+)'/g)),
						},
					})),
					{ story: 'Md', key: 'Md#1', props: { size: 'md' }, values: { height: at(of(files['src/theme.ts'], /md: \{ height: '([^']+)'/)) } },
				]
			: (() => {
					const css = files['src/Badge/Badge.module.css'];
					const radius = of(css, /border-radius: ([^;]+);/) ?? '0px';
					const [v, h = v] = (of(css, /padding: ([^;]+);/) ?? '0px').split(' ');
					return [
						{
							story: 'Default',
							key: 'Badge#1',
							props: {},
							values: { radius: `${radius} ${radius} ${radius} ${radius}`, padding: `${v} ${h} ${v} ${h}`, text: 'rgb(9, 105, 218)' },
						},
					];
				})();
	return { colors: {}, radii: {}, spacing: {}, component: true, instances };
};

let builds: Record<string, string>[];
let asks: string[][];

const reads = (files: Record<string, string>): CatalogReads => ({
	listFiles: async () => Object.keys(files),
	readFile: async (path) => {
		if (!(path in files)) throw new Error(`no ${path}`);
		return files[path] as string;
	},
});
/** Each build is the library with the files it was given in place of its own, at an address that says which it is. */
const buildWith = (given: Map<string, string>): string => {
	builds.push({ ...library, ...Object.fromEntries(given) });
	return `build-${builds.length - 1}`;
};
const measure: Measure = async (runs) => {
	asks.push(runs.flatMap((r) => r.files));
	return runs.map((r) => r.files.map((f) => draw(r.base === 'as-is' ? library : (builds[Number(r.base.slice(6))] as Record<string, string>), f)));
};
let library: Record<string, string>;
const values = (): Map<string, ComponentValues> =>
	new Map([
		[
			BUTTON,
			{
				state: 'read',
				instances: 3,
				unmarked: 0,
				rows: {
					light: [
						{
							property: 'height',
							by: 'size',
							cells: [{ variant: 'sm', value: '28px', kind: 'own', tokens: [], instances: 2, targets: ['Sm#1', 'Sm#2'] }],
						},
					],
					dark: null,
				},
			},
		],
	]);
const built: Built = { files: new Map(), values: values(), accessibility: new Map(), order: [BUTTON, BADGE] };
const index = { key: 'commit', built };
const drawings = (files: Record<string, string>) => new Map([BUTTON, BADGE].map((f) => [f, { light: draw(files, f), dark: null }]));

const sources = () =>
	new ValueSources({
		tokens: {
			drawn: async () => ({ state: 'ready', ...index }),
			asIs: async () => drawings(library),
			reachWith: async (_index, files) => {
				const given = await files(reads(library));
				const after = drawings({ ...library, ...Object.fromEntries(given) });
				builds.push({ ...library, ...Object.fromEntries(given) });
				return { reach: reachOf(built.order, drawings(library), after, built.values), after };
			},
		},
		previews: {
			opened: async () => ({ state: 'open', reads: reads(library), build: async (given) => buildWith(given), close: async () => undefined }),
		},
		measure,
	});

/** Asked until it is no longer being found. */
const settled = async (s: ValueSources, file: string, tried: TriedValue[]): Promise<Answer> => {
	for (let n = 0; n < 200; n++) {
		const a = await s.of(file, tried);
		if (a.state !== 'building') return a;
		await new Promise((r) => setTimeout(r, 5));
	}
	throw new Error('never found');
};
const SM: TriedValue = { property: 'height', value: '32px', targets: ['Sm#1', 'Sm#2'] };
const BADGE_ALL = ['Badge#1'];

beforeEach(() => {
	library = { ...LIBRARY };
	builds = [];
	asks = [];
});

describe('where a value tried on a component is written, found by its effect (Phase 4)', () => {
	it('finds the one place that draws it, of every place it is written, says it, and what writing it reaches', async () => {
		const s = sources();
		expect(await s.of(BUTTON, [SM])).toEqual({ state: 'building' });
		const a = await settled(s, BUTTON, [SM]);
		expect(a).toMatchObject({
			state: 'ready',
			values: [{ id: 'height\u0000Sm#1\u0001Sm#2', state: 'found', places: [{ file: 'src/theme.ts', line: 2, written: '28px', writes: '32px' }] }],
			reach: {
				state: 'ready',
				moved: [{ file: BUTTON, changes: [{ mode: 'light', property: 'height', variant: 'sm', from: '28px', to: '32px', instances: 2 }] }],
				unchanged: 1,
			},
		});
		// What saving it writes: that place, and nothing else.
		const files = await s.files(BUTTON, [SM]);
		expect([...files.keys()]).toEqual(['src/theme.ts']);
		expect(files.get('src/theme.ts')).toBe(LIBRARY['src/theme.ts']?.replace("sm: { height: '28px' }", "sm: { height: '32px' }"));
	});

	it('finds it once for the value drawn, so another value tried there is only written and read back', async () => {
		const s = sources();
		await settled(s, BUTTON, [SM]);
		const found = builds.length;
		const a = await settled(s, BUTTON, [{ ...SM, value: '40px' }]);
		expect(a).toMatchObject({ state: 'ready', values: [{ state: 'found', places: [{ line: 2, writes: '40px' }] }] });
		// One build: the write, read back. No place was tried again.
		expect(builds.length - found).toBe(1);
	});

	it('tries many places in halves, far fewer builds than places, and finds the same one', async () => {
		for (let n = 0; n < 60; n++) library[`src/decoys/d${n}.ts`] = "export const d = '28px';";
		const s = sources();
		const a = await settled(s, BUTTON, [SM]);
		expect(a).toMatchObject({ state: 'ready', values: [{ state: 'found', places: [{ file: 'src/theme.ts', line: 2 }] }] });
		expect(builds.length).toBeLessThan(20);
	});

	it('finds a CSS module’s value, and refuses parts written as one that are tried apart', async () => {
		const s = sources();
		const radius = await settled(s, BADGE, [{ property: 'radius', value: '4px 4px 4px 4px', targets: BADGE_ALL }]);
		expect(radius).toMatchObject({
			values: [{ state: 'found', places: [{ file: 'src/Badge/Badge.module.css', line: 2, written: '20px', writes: '4px' }] }],
		});
		// Its left and right are written once (`2px 6px`): the left alone cannot be.
		const left = await settled(s, BADGE, [{ property: 'padding', value: '2px 6px 2px 8px', targets: BADGE_ALL }]);
		expect(left).toMatchObject({
			values: [{ state: 'refused', why: expect.stringMatching(/^src\/Badge\/Badge\.module\.css, line 3, writes 6px once for parts tried apart/) }],
		});
		// Both together, it is.
		const sides = await settled(s, BADGE, [{ property: 'padding', value: '2px 8px 2px 8px', targets: BADGE_ALL }]);
		expect(sides).toMatchObject({ values: [{ state: 'found', places: [{ line: 3, written: '6px', writes: '8px' }] }] });
	});

	it('refuses, in words, a value written nowhere it can be found, and one written in places that each draw it', async () => {
		const s = sources();
		const text = await settled(s, BADGE, [{ property: 'text', value: '#C80000', targets: BADGE_ALL }]);
		expect(text).toMatchObject({ values: [{ state: 'refused', why: expect.stringMatching(/not written in the design system's own files for it/) }] });
		await expect(s.files(BADGE, [{ property: 'text', value: '#C80000', targets: BADGE_ALL }])).rejects.toThrow(/not written/);
		// Written twice, either of which draws it: which to change cannot be said.
		library['src/theme.ts'] = `${LIBRARY['src/theme.ts']}\nexport const again = { sm: { height: '28px' } };`;
		const twice = await settled(sources(), BUTTON, [SM]);
		expect(twice).toMatchObject({ values: [{ state: 'refused', why: expect.stringMatching(/written in 2 places that each draw it/) }] });
	});

	it('refuses a value only some of whose instances are drawn from where it can be found', async () => {
		library['src/Button/fromPackage.ts'] = "export { Button } from '@acme/button';";
		const a = await settled(sources(), BUTTON, [SM]);
		expect(a).toMatchObject({ values: [{ state: 'refused', why: 'Only some of it is written where it can be found (src/theme.ts, line 2).' }] });
	});

	it('refuses a value that does not read back as asked, and writes nothing for it', async () => {
		const s = sources();
		// The library draws a Button at least 26px tall: 24px, written, draws 26px.
		const a = await settled(s, BUTTON, [{ ...SM, value: '24px' }]);
		expect(a).toMatchObject({
			state: 'ready',
			values: [{ state: 'refused', why: 'Written where it was found, it draws 26px, not 24px, so it is not saved.' }],
			reach: { state: 'none' },
		});
		await expect(s.files(BUTTON, [{ ...SM, value: '24px' }])).rejects.toThrow('draws 26px, not 24px');
	});

	it('says how many places are too many to try, and nothing is built', async () => {
		library['src/many.ts'] = Array.from({ length: MOST_PLACES + 1 }, () => "'28px'").join(',');
		const a = await settled(sources(), BUTTON, [SM]);
		expect(a).toMatchObject({
			values: [
				{ state: 'refused', why: `28px is written in ${MOST_PLACES + 3} places in the design system's files, more than are tried (${MOST_PLACES}).` },
			],
		});
		expect(builds).toEqual([]);
	});

	it('is none with nothing tried, and says it is still being found until it is, for the newest asked only', async () => {
		const s = sources();
		expect(await s.of(BUTTON, [])).toEqual({ state: 'none' });
		await expect(s.files(BUTTON, [SM])).rejects.toThrow('still being found');
		await settled(s, BUTTON, [SM]);
		expect(await s.files(BUTTON, [SM])).toBeInstanceOf(Map);
	});
});
