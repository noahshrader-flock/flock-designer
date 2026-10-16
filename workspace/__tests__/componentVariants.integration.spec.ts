import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Built, Drawn, Instance, Measure } from '../src/main/services/componentTokens';
import { typeLibs } from '../src/main/services/componentProps';
import { ComponentVariants } from '../src/main/services/componentVariants';
import type { ComponentVariants as Answer, ConnectedDesignSystem } from '../src/shared/contract';
import { findChrome } from '../src/main/services/chromeHeadless';
import { REAL_LIBRARY, REAL_PRIMER, describeWith, libraryMissing, primerMissing } from './realCheckouts';
import { settledAnswer } from './fixtures';
import { onRealLibrary } from './realLibrary';

/**
 * A component drawn in every case its props declare (Phase 5), against a small library written here, its props read by the
 * real compiler; drawn by a stand-in that draws as this test says: `Default` takes its args, `Fixed` sets its size itself,
 * `AllSizes` draws every size at once.
 */
const BUTTON = 'src/Button.stories.tsx';
const LIBRARY: Record<string, string> = {
	'tsconfig.json': JSON.stringify({ compilerOptions: { jsx: 'react-jsx', strict: true } }),
	'src/Button.tsx':
		"export const Button = (props: { size?: 'sm' | 'md' | 'lg'; loud?: boolean; label?: string }) => <button>{props.label}</button>;\n",
	[BUTTON]: "import { Button } from './Button';\nexport default { title: 'Button', component: Button };\n",
	'src/Nothing.stories.tsx': "export default { title: 'Nothing' };\n",
};
const HEIGHTS: Record<string, string> = { sm: '28px', md: '36px', lg: '48px' };

let root: string;
/** The stories the library's stories draw as it is, each with how many instances of the component. */
let asIsStories: [string, number][];
let asked: { story: string[]; props: string[] }[];

/** How the stand-in draws: each section of a story its instance, with the size it was given, unless the story is `Fixed`. */
const measure: Measure = async (runs) =>
	runs.map((run) =>
		run.files.map((): Drawn => {
			const vary = run.vary;
			if (!vary) return { colors: {}, radii: {}, spacing: {} };
			asked.push({ story: vary.stories, props: vary.props.map((p) => p.name) });
			const story = vary.stories[0] ?? 'Default';
			const instances: Instance[] = vary.props.flatMap(({ name, values }) =>
				values.map((value) => {
					const size = story === 'Fixed' && name === 'size' ? 'md' : name === 'size' ? String(value) : 'md';
					const props: Record<string, string> = { size, ...(name === 'size' ? {} : { [name]: String(value) }) };
					return { story: `${story} · ${name}=${value}`, key: `${story}·${name}=${value}#1`, props, values: { height: HEIGHTS[size] as string } };
				}),
			);
			return { colors: {}, radii: {}, spacing: {}, component: true, instances, controls: vary.props.map((p) => p.name) };
		}),
	);
const built: Built = {
	files: new Map(),
	values: new Map(),
	accessibility: new Map(),
	order: [BUTTON, 'src/Nothing.stories.tsx'],
	reading: { tags: { edits: [], colors: new Map(), sizes: [], unmarked: 0 }, tokens: [], tagged: null },
};
const variants = (libs: string | null = typeLibs()) =>
	new ComponentVariants({
		tokens: {
			drawn: async () => ({ state: 'ready', key: 'commit:', built }),
			asIs: async () =>
				new Map([
					[
						BUTTON,
						{
							light: {
								colors: {},
								radii: {},
								spacing: {},
								instances: asIsStories.flatMap(([story, n]) =>
									Array.from({ length: n }, (_, i) => ({ story, key: `${story}#${i}`, props: {}, values: {} })),
								),
							},
							dark: null,
						},
					],
				]),
		},
		previews: { copy: async () => root, preview: async () => ({ state: 'ready', base: 'http://127.0.0.1:1/plain/' }) },
		measure,
		typeLibs: libs,
		folder: () => '',
	});
const settled = (v: ComponentVariants, file: string): Promise<Answer> =>
	settledAnswer(
		() => v.of(file),
		(a) => a.state === 'building',
		{ within: 600_000 },
	);

beforeAll(() => {
	root = mkdtempSync(join(tmpdir(), 'dsnr-variants-'));
	for (const [path, text] of Object.entries(LIBRARY)) {
		mkdirSync(dirname(join(root, path)), { recursive: true });
		writeFileSync(join(root, path), text);
	}
	mkdirSync(join(root, 'node_modules', '@types'), { recursive: true });
	for (const p of ['react', '@types/react', 'csstype'])
		symlinkSync(join(__dirname, '..', 'node_modules', p), join(root, 'node_modules', p), 'junction');
});
afterAll(() => rmSync(root, { recursive: true, force: true }));
beforeEach(() => {
	asIsStories = [
		['AllSizes', 3],
		['Fixed', 1],
		['Default', 1],
	];
	asked = [];
});

describe('a component drawn in every case its props declare (Phase 5)', () => {
	it('draws each value on a story that draws it once and takes them, and reads each case as its values are', async () => {
		const a = await settled(variants(), BUTTON);
		// Of the stories that draw it once, Fixed did not take its size; Default did, and is what it is drawn on.
		expect(asked.slice(0, 2).map((r) => r.story)).toEqual([['Fixed'], ['Default']]);
		expect(asked.slice(2).every((r) => r.story[0] === 'Default')).toBe(true);
		expect(a).toMatchObject({
			state: 'ready',
			props: [
				{ name: 'loud', values: [false, true] },
				{ name: 'size', values: ['sm', 'md', 'lg'] },
			],
			fixed: [],
			unvaried: [{ name: 'label', why: 'text' }],
		});
		const rows = a.state === 'ready' && a.values.state === 'read' ? a.values.rows.light : null;
		expect(rows?.find((r) => r.property === 'height')).toMatchObject({
			by: 'size',
			cells: [
				{ variant: 'md', value: '36px' },
				{ variant: 'sm', value: '28px' },
				{ variant: 'lg', value: '48px' },
			],
		});
	});

	it('says which props its story sets itself, when no story that draws it once takes them', async () => {
		asIsStories = [['Fixed', 1]];
		const a = await settled(variants(), BUTTON);
		expect(a).toMatchObject({ state: 'ready', fixed: ['size'] });
	});

	it('is none for stories that name no component, and says it when the compiler’s type libraries are not with the app', async () => {
		expect(await settled(variants(), 'src/Nothing.stories.tsx')).toEqual({ state: 'none' });
		expect(await settled(variants(null), BUTTON)).toEqual({
			state: 'failed',
			error: "The compiler's type libraries are not with the app, so its props cannot be read.",
		});
	});
});

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

describeWith(libraryMissing, 'on Flock’s FUI', () => {
	it.skipIf(findChrome() === null)(
		'draws FSChip’s sizes, FSBadge’s dot and FSTextField’s sizes, which MUI declares, from their props',
		async () => {
			const repository = 'flocksafety/flock-react-component-lib';
			await onReal({ id: repository, name: 'FUI', repository, root: REAL_LIBRARY, folder: '', branch: 'develop' }, async (of) => {
				const file = (name: string) => `src/components/${name}/${name}.stories.tsx`;
				expect(rowOf(await of(file('FSChip')), 'height')).toEqual({ medium: '32px', small: '24px', tiny: '16px' });
				const badge = await of(file('FSBadge'));
				expect(badge).toMatchObject({ state: 'ready', fixed: [] });
				expect(rowOf(badge, 'height')).toMatchObject({ dot: '8px', standard: '20px' });
				expect(rowOf(await of(file('FSTextField')), 'height')).toMatchObject({ small: '40px', medium: '56px', search: '48px' });
			});
		},
		1_800_000,
	);
});

describeWith(primerMissing, 'on Primer React', () => {
	it.skipIf(findChrome() === null)(
		'draws Label’s sizes on the story that takes its props, not the one that sets them itself',
		async () => {
			const system = { id: 'primer/react', name: 'Primer', repository: 'primer/react', root: REAL_PRIMER, folder: 'packages/react', branch: 'main' };
			await onReal(system, async (of) => {
				const label = await of('packages/react/src/Label/Label.stories.tsx');
				expect(label).toMatchObject({ state: 'ready', fixed: [] });
				expect(rowOf(label, 'height')).toEqual({ small: '20px', large: '24px' });
			});
		},
		1_800_000,
	);
});
