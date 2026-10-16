import { beforeEach, describe, expect, it } from 'vitest';
import { reachOf } from '../src/main/services/changeReach';
import { settledAnswer } from './fixtures';
import type { Built, Drawn, Instance, Measure } from '../src/main/services/componentTokens';
import type { CatalogReads } from '../src/main/services/componentCatalog';
import { MOST_PLACES, ValueSources } from '../src/main/services/valueSources';
import type { Written } from '../src/main/services/valueAgent';
import { triedId } from '../src/shared/contract';
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
	// The stories throw when the limits are not as written: nothing of the Button draws.
	if (file === BUTTON && files['src/limits.ts'] !== undefined && !files['src/limits.ts'].includes("'28px'"))
		return { colors: {}, radii: {}, spacing: {}, component: true, instances: [] };
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
							values: {
								radius: `${radius} ${radius} ${radius} ${radius}`,
								padding: `${v} ${h} ${v} ${h}`,
								text: of(files['src/Badge/Badge.tsx'], /textColor = '([^']+)'/) ?? 'rgb(9, 105, 218)',
							},
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
const built: Built = {
	files: new Map(),
	values: values(),
	accessibility: new Map(),
	order: [BUTTON, BADGE],
	reading: { tags: { edits: [], colors: new Map(), sizes: [], unmarked: 0 }, tokens: [], tagged: null },
};
/** The commit the index is of: what a place found is kept for. */
let commit = 'commit';
const index = { key: 'commit', built };
const drawings = (files: Record<string, string>) => new Map([BUTTON, BADGE].map((f) => [f, { light: draw(files, f), dark: null }]));

const sources = () =>
	new ValueSources({
		tokens: {
			drawn: async () => ({ state: 'ready', ...index, key: commit }),
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
		agent: { of: (_index, _file, t) => agent.get(triedId(t)) ?? null },
	});

/** Asked until it is no longer being found. */
const settled = (s: ValueSources, file: string, tried: TriedValue[]): Promise<Answer> =>
	settledAnswer(
		() => s.of(file, tried),
		(a) => a.state === 'building',
	);
const SM: TriedValue = { property: 'height', value: '32px', targets: ['Sm#1', 'Sm#2'] };
const BADGE_ALL = ['Badge#1'];

/** What the agent has written, by the value: a stand-in for `ValueAgent`, which has tests of its own. */
let agent: Map<string, Written>;

beforeEach(() => {
	agent = new Map();
	commit = 'commit';
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

	it('finds it again on another commit, not from what was found on the one before', async () => {
		const s = sources();
		await settled(s, BUTTON, [SM]);
		const found = builds.length;
		commit = 'moved';
		await settled(s, BUTTON, [{ ...SM, value: '40px' }]);
		expect(builds.length - found).toBeGreaterThan(1);
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
		expect(text).toMatchObject({
			values: [{ state: 'refused', why: expect.stringMatching(/not written as a value in the design system's own files for it/) }],
		});
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

	it('halves again a group whose probe stops the component drawing, so the place among them is still found', async () => {
		// A number the stories cannot draw without: changed, the Button does not draw at all.
		library['src/limits.ts'] = "export const limits = { most: '28px' };";
		const a = await settled(sources(), BUTTON, [SM]);
		expect(a).toMatchObject({ values: [{ state: 'found', places: [{ file: 'src/theme.ts', line: 2 }] }] });
	});

	it('says so of a value drawn in a form it cannot look for, and offers the agent', async () => {
		library['src/Badge/Badge.tsx'] = "export const textColor = 'oklch(0.6 0.1 250)';\n";
		const a = await settled(sources(), BADGE, [{ property: 'text', value: '#C80000', targets: BADGE_ALL }]);
		expect(a).toMatchObject({
			values: [
				{
					state: 'refused',
					agent: 'write',
					why: 'oklch(0.6 0.1 250) is drawn in a form DSNR cannot look for in the source yet, so where it is written cannot be found.',
				},
			],
		});
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

	describe('what the agent wrote, where there is nothing to swap (4.5, 4.6)', () => {
		const TEXT: TriedValue = { property: 'text', value: '#C80000', targets: BADGE_ALL };
		const badge = (text: string) => ({ 'src/Badge/Badge.tsx': `${LIBRARY['src/Badge/Badge.tsx']}export const textColor = '${text}';\n` });
		const written = (files: Record<string, string>, said = 'The colour is the component’s own.'): Written => ({
			state: 'written',
			files: new Map(Object.entries(files)),
			places: Object.keys(files).map((file) => ({ file, line: 2, written: '', writes: 'the change' })),
			said,
		});

		it('offers the agent for a value written nowhere it can be found, says while it writes, and waits to be saved', async () => {
			const s = sources();
			expect(await settled(s, BADGE, [TEXT])).toMatchObject({
				values: [{ state: 'refused', agent: 'write', why: expect.stringMatching(/not written/) }],
			});
			// Asked again once the agent is writing it: worked out again, not the answer kept from before.
			agent.set(triedId(TEXT), { state: 'writing' });
			expect(await settled(s, BADGE, [TEXT])).toMatchObject({ state: 'ready', values: [{ state: 'writing' }], reach: { state: 'none' } });
			await expect(s.files(BADGE, [TEXT])).rejects.toThrow('The agent is still writing a value');
		});

		it('takes what the agent wrote once it reads back, saying it was the agent’s and why, with what it moves', async () => {
			agent.set(triedId(TEXT), written(badge('#c80000'), 'Its text colour had no value of its own to change.'));
			const s = sources();
			expect(await settled(s, BADGE, [TEXT])).toMatchObject({
				state: 'ready',
				values: [
					{
						state: 'found',
						by: 'agent',
						said: 'Its text colour had no value of its own to change.',
						places: [{ file: 'src/Badge/Badge.tsx', line: 2 }],
					},
				],
				reach: { state: 'ready', moved: [{ file: BADGE }] },
			});
			expect([...(await s.files(BADGE, [TEXT])).keys()]).toEqual(['src/Badge/Badge.tsx']);
		});

		it('puts what the agent wrote together with places found in the same file, and refuses one that writes the same lines', async () => {
			const RADIUS: TriedValue = { property: 'radius', value: '4px 4px 4px 4px', targets: BADGE_ALL };
			const css = LIBRARY['src/Badge/Badge.module.css'] as string;
			// The radius found in the module; the agent's line added at its end: both kept.
			agent.set(triedId(TEXT), written({ ...badge('#c80000'), 'src/Badge/Badge.module.css': `${css}.note {}\n` }));
			const s = sources();
			expect(await settled(s, BADGE, [RADIUS, TEXT])).toMatchObject({ values: [{ state: 'found' }, { state: 'found', by: 'agent' }] });
			expect((await s.files(BADGE, [RADIUS, TEXT])).get('src/Badge/Badge.module.css')).toBe(`${css.replace('20px', '4px')}.note {}\n`);
			// The agent's in the radius's own line: not written, and said.
			agent.set(triedId(TEXT), written({ ...badge('#c80000'), 'src/Badge/Badge.module.css': css.replace('20px', '21px') }));
			expect(await settled(sources(), BADGE, [RADIUS, TEXT])).toMatchObject({
				values: [
					{ state: 'found' },
					{ state: 'refused', why: 'The agent wrote it in the same lines as another value tried, so they cannot be saved together.' },
				],
			});
		});

		it('refuses what the agent wrote when it does not read back as asked', async () => {
			agent.set(triedId(TEXT), written(badge('#00ff00')));
			expect(await settled(sources(), BADGE, [TEXT])).toMatchObject({
				values: [{ state: 'refused', why: 'Written by the agent, it draws #00ff00, not #C80000, so it is not saved.' }],
			});
		});

		it('leaves a value to follow a token to the agent alone, and takes it once written', async () => {
			const FOLLOW: TriedValue = { property: 'radius', value: '20px 20px 20px 20px', targets: BADGE_ALL, follows: 'radius' };
			expect(await settled(sources(), BADGE, [FOLLOW])).toMatchObject({
				values: [{ state: 'refused', agent: 'follow', why: 'To follow radius, the agent writes it.' }],
			});
			// Never found by the locator, though 20px is written where it can be.
			expect(builds).toEqual([]);
			agent.set(
				triedId(FOLLOW),
				written({ 'src/Badge/Badge.module.css': LIBRARY['src/Badge/Badge.module.css']!.replace('20px;', '20px; /* the shared radius */') }),
			);
			const s = sources();
			expect(await settled(s, BADGE, [FOLLOW])).toMatchObject({ values: [{ state: 'found', by: 'agent' }] });
		});
	});
});
