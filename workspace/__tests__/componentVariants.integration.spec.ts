import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Built, Drawn, Instance, Measure } from '../src/core/services/componentTokens';
import { typeLibs } from '../src/core/services/componentProps';
import { ComponentVariants } from '../src/core/services/componentVariants';
import type { ComponentVariants as Answer } from '../src/shared/contract';
import { settledAnswer } from './fixtures';

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
			drawn: async () => ({ state: 'ready', key: 'commit:', commit: 'commit', built }),
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
		// Drawn once each to find it, and not again: the drawing that found it is the one read (this library has no tags drawn).
		expect(asked).toHaveLength(2);
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
