import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ComponentTokens, type Drawn, type Measure, decode, tagsFor } from '../src/main/services/componentTokens';
import type { DesignToken, TokenEdit } from '../src/shared/contract';
import { g } from './fixtures';

/**
 * Which tokens each component draws with (T6 of the design system plan, decision 29): every token tagged with a value
 * nothing else has, every story drawn, and what it drew read back. Against fixtures; the previews and the drawing are
 * stand-ins, and the real drawing is the app's (`storyMeasure.ts`).
 */

const token = (path: string, kind: 'color' | 'dimension', value: string, more: Partial<DesignToken> = {}): DesignToken => ({
	path,
	kind,
	category: kind === 'color' ? 'Color' : path === 'radius' ? 'Shape' : 'Spacing',
	group: kind === 'color' ? 'Light' : path === 'radius' ? 'Radius' : 'Spacing',
	set: path.split('.').slice(-2, -1)[0] ?? path,
	name: path.split('.').pop() as string,
	value,
	source: { file: 'src/theme.ts', line: path.length },
	...more,
});
const TOKENS = [
	token('palette.light.primary.main', 'color', '#108062'),
	token('palette.light.primary.contrastText', 'color', '#FFFFFF'),
	// Written once, in a palette both modes spread in: one place, tagged once.
	token('palette.light.info.main', 'color', '#0000FF', { source: { file: 'src/shared.ts', line: 4 } }),
	token('palette.dark.info.main', 'color', '#0000FF', { group: 'Dark', source: { file: 'src/shared.ts', line: 4 } }),
	token('spacing', 'dimension', '8px'),
	token('radius', 'dimension', '0.5rem'),
	token('font', 'dimension', '1em'),
];
const drawn = (colors: Record<string, number> = {}, radii: Record<string, number> = {}, spacing: Record<string, number> = {}): Drawn => ({
	colors,
	radii,
	spacing,
});

describe('the tags', () => {
	const tags = tagsFor(TOKENS);

	it('give every color its own tag, by its number, and a role both modes share one', () => {
		expect([...tags.colors]).toEqual([
			['#00015A', 'palette.light.primary.main'],
			['#00025A', 'palette.light.primary.contrastText'],
			['#00035A', 'palette.light.info.main'],
		]);
	});

	it('give each length a prime number of pixels, in the unit it is written in, and leave out one in em', () => {
		expect(tags.sizes).toEqual([
			{ px: 13, path: 'spacing' },
			{ px: 17, path: 'radius' },
		]);
		expect(tags.edits.filter((e) => 'value' in e && !e.value.startsWith('#'))).toEqual([
			{ path: 'spacing', value: '13px' },
			{ path: 'radius', value: '1.0625rem' },
		]);
		expect(tags.edits.some((e) => e.path === 'font')).toBe(false);
	});

	it('give every length a tag however many a library has, each a prime, none a multiple of another', () => {
		const many = Array.from({ length: 40 }, (_, i) => token(`space.${i}`, 'dimension', `${i + 1}px`));
		const sizes = tagsFor(many).sizes.map((s) => s.px);
		expect(sizes).toHaveLength(40);
		expect(sizes.slice(0, 6)).toEqual([13, 17, 19, 23, 29, 31]);
		for (const a of sizes) for (const b of sizes) if (a !== b) for (let k = 1; k <= 8; k++) expect((a * k) % b === 0 && (a * k) / b <= 8).toBe(false);
	});

	it('are edits of values, so a pointer is given the tag and named by it, not by what it points at', () => {
		expect(tags.edits.every((e: TokenEdit) => 'value' in e)).toBe(true);
	});
});

describe('reading what a story drew', () => {
	const tags = tagsFor(TOKENS);

	it('names each tag’s token, whatever its opacity, and a size that is a whole multiple of a tag', () => {
		const use = decode(
			{ light: drawn({ 'rgb(0, 1, 90)': 5, 'rgba(0, 2, 90, 0.4)': 2 }, { '17px': 3, '34px': 1 }, { '26px': 4, '13px': 1 }) },
			drawn(),
			tags,
			TOKENS,
		);
		expect(Object.fromEntries(use.uses)).toEqual({ 'palette.light.primary.main': 5, 'palette.light.primary.contrastText': 2, radius: 4, spacing: 5 });
	});

	it('names, in dark, the Dark token written in the place a shared role was tagged as Light', () => {
		const use = decode({ dark: drawn({ 'rgb(0, 3, 90)': 2 }) }, undefined, tags, TOKENS);
		expect(Object.fromEntries(use.uses)).toEqual({ 'palette.dark.info.main': 2 });
	});

	it('tells what the component sets itself, also in its plain drawing, from what is worked out from a token', () => {
		const use = decode(
			{ light: drawn({ 'rgba(0, 0, 0, 0.87)': 6, 'rgb(1, 2, 3)': 2, 'rgba(0, 0, 0, 0)': 9 }, { '360px': 4, '50%': 1, '0px': 7 }, { '9px': 2, normal: 30 }) },
			drawn({ 'rgba(0, 0, 0, 0.87)': 6, 'rgb(16, 128, 98)': 3 }),
			tags,
			TOKENS,
		);
		expect(use.notTokens).toEqual([
			{ kind: 'color', value: 'rgba(0, 0, 0, 0.87)', uses: 6 },
			{ kind: 'radius', value: '360px', uses: 4 },
			{ kind: 'spacing', value: '9px', uses: 2 },
			{ kind: 'radius', value: '50%', uses: 1 },
		]);
		// A shade of a tag: worked out from a token, not set by the component, and not a token itself.
		expect(use.derived).toBe(2);
	});

	it('does not read a size as a token past a few times its tag, nor one that is a tag of nothing', () => {
		const use = decode({ light: drawn({}, { [`${17 * 9}px`]: 1 }, { '14px': 1 }) }, drawn(), tags, TOKENS);
		expect(use.uses.size).toBe(0);
		expect(use.notTokens.map((n) => n.value)).toEqual(['153px', '14px']);
	});
});

describe('the index', () => {
	let home: string;
	let clone: string;
	let asked: { base: string; mode: string; files: string[] }[][];
	let builds: TokenEdit[][];
	const LIB = {
		'src/colors/tones/brand.ts': "export const brand = {\n  50: '#108062',\n};\n",
		'src/colors/theme/light.ts':
			"import { brand } from '../tones/brand';\nexport const lightPalette = {\n  mode: 'light',\n  primary: { main: brand[50] },\n};\n",
		'src/components/A/A.stories.tsx': "export default { title: 'Buttons/A' };\nexport const Default = () => null;\n",
		'src/components/B/B.stories.tsx': "export default { title: 'Inputs/B' };\nexport const Default = () => null;\n",
		// The library's own token page, which the list leaves out while the panel shows the tokens (decision 22).
		'src/uxDocs/Palette.stories.tsx': "export default { title: 'Design Tokens/Palette' };\nexport const Default = () => null;\n",
	};
	/** A drawn A with primary's tag, B with the tone's and a hardcoded gray: what each page is, by its address. */
	const measure: Measure = async (runs) => {
		asked.push(runs);
		return runs.map((run) =>
			run.files.map((f) => {
				if (run.base.includes('plain')) return drawn({ 'rgb(107, 114, 128)': 1 });
				return f.includes('A.stories') ? drawn({ 'rgb(0, 1, 90)': 3 }) : drawn({ 'rgb(0, 2, 90)': 1, 'rgb(107, 114, 128)': 1 });
			}),
		);
	};
	const previews = {
		preview: async () => ({ state: 'ready' as const, base: 'http://127.0.0.1:1/plain/' }),
		tagged: async (edits: TokenEdit[]) => (builds.push(edits), { state: 'ready' as const, base: 'http://127.0.0.1:1/tagged/' }),
	};
	const system = () => ({ id: 'acme/ui', name: 'Acme', repository: 'acme/ui', root: clone, folder: '', branch: 'develop' });
	/** The pictures kept, as the pass gave them: a stand-in for the store, which has tests of its own. */
	let kept: { system: string; listed: string[]; taken: Map<string, Buffer> }[];
	const pictures = {
		keep: (system: string, listed: string[], taken: Map<string, Buffer>) => void kept.push({ system, listed, taken }),
		of: async () => Object.fromEntries([...(kept.at(-1)?.taken.keys() ?? [])].map((f) => [f, `http://127.0.0.1:1/pictures/${f}`])),
	};
	const index = (more: Partial<ConstructorParameters<typeof ComponentTokens>[0]> = {}) => new ComponentTokens({ system, previews, measure, pictures, ...more });
	const ready = async (i: ComponentTokens, file: string) => {
		for (let n = 0; n < 50; n++) {
			const a = await i.of(file);
			if (a.state !== 'building') return a;
			await new Promise((r) => setTimeout(r, 10));
		}
		throw new Error('never built');
	};

	beforeEach(() => {
		home = mkdtempSync(join(tmpdir(), 'dsnr-component-tokens-'));
		const upstream = join(home, 'upstream');
		clone = join(home, 'ui');
		g(home, 'init', '-q', '--bare', '-b', 'develop', join(home, 'remote.git'));
		g(home, 'init', '-q', '-b', 'develop', upstream);
		for (const [path, text] of Object.entries(LIB)) {
			mkdirSync(dirname(join(upstream, path)), { recursive: true });
			writeFileSync(join(upstream, path), text);
		}
		g(upstream, 'add', '-A');
		g(upstream, '-c', 'user.name=T', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'library');
		g(upstream, 'remote', 'add', 'origin', join(home, 'remote.git'));
		g(upstream, 'push', '-q', 'origin', 'develop');
		g(home, 'clone', '-q', join(home, 'remote.git'), clone);
		asked = [];
		builds = [];
		kept = [];
	});
	afterEach(() => rmSync(home, { recursive: true, force: true }));

	it('is building on the first ask, and draws every story three times: tagged in light and dark, and plain in light', async () => {
		const i = index();
		expect(await i.of('src/components/A/A.stories.tsx')).toEqual({ state: 'building' });
		await ready(i, 'src/components/A/A.stories.tsx');
		// Not the token page: it is not a component, and would be said to share every token.
		const files = ['src/components/A/A.stories.tsx', 'src/components/B/B.stories.tsx'];
		expect(asked).toEqual([
			[
				{ base: 'http://127.0.0.1:1/tagged/', mode: 'light', files },
				{ base: 'http://127.0.0.1:1/tagged/', mode: 'dark', files },
				{ base: 'http://127.0.0.1:1/plain/', mode: 'light', files, pictures: true },
			],
		]);
	});

	it('says each component’s tokens, how often, who else draws with them, and what it sets itself', async () => {
		const i = index();
		await ready(i, 'src/components/A/A.stories.tsx');
		const b = await ready(i, 'src/components/B/B.stories.tsx');
		expect(b).toEqual({
			state: 'ready',
			// B draws with the tone; primary points at it, but was tagged on its own, so A is primary's and B the tone's.
			uses: [{ path: 'tone.brand.50', uses: 2 }],
			sharedWith: { 'tone.brand.50': [] },
			notTokens: [{ kind: 'color', value: 'rgb(107, 114, 128)', uses: 1 }],
			derived: 0,
		});
		const a = await i.of('src/components/A/A.stories.tsx');
		expect(a).toMatchObject({ state: 'ready', uses: [{ path: 'palette.light.primary.main', uses: 6 }] });
	});

	it('is built once for a commit, however often it is asked, and refuses a file that is not a story', async () => {
		const i = index();
		await ready(i, 'src/components/A/A.stories.tsx');
		await i.of('src/components/B/B.stories.tsx');
		expect(builds).toHaveLength(1);
		expect(asked).toHaveLength(1);
		expect(await i.of('src/colors/theme/light.ts')).toEqual({
			state: 'failed',
			error: 'src/colors/theme/light.ts is not one of the library’s story files.'.replace('’', "'"),
		});
	});

	it('says why it could not be built, and tries again on the next ask', async () => {
		let fail = true;
		const i = index({
			previews: { ...previews, tagged: async () => (fail ? { state: 'failed' as const, error: 'tags did not build' } : previews.tagged([])) },
		});
		expect(await ready(i, 'src/components/A/A.stories.tsx')).toEqual({ state: 'failed', error: 'tags did not build' });
		fail = false;
		expect((await ready(i, 'src/components/A/A.stories.tsx')).state).toBe('ready');
	});

	it('says a component’s stories did not draw, rather than that it draws with no token', async () => {
		const i = index({ measure: async (runs) => runs.map((run) => run.files.map((f) => (f.includes('B.stories') ? null : drawn({ 'rgb(0, 1, 90)': 1 })))) });
		expect(await ready(i, 'src/components/B/B.stories.tsx')).toEqual({ state: 'failed', error: expect.stringContaining('did not draw') });
		// The others are still said, and are not said to share with the one that did not draw.
		expect(await i.of('src/components/A/A.stories.tsx')).toMatchObject({ state: 'ready', sharedWith: { 'palette.light.primary.main': [] } });
	});

	it('is got ready in the background without a component being asked for, so the first ask is answered at once', async () => {
		const i = index();
		await i.warm();
		expect(asked).toHaveLength(1);
		expect(await i.of('src/components/A/A.stories.tsx')).toMatchObject({ state: 'ready' });
		// Warmed again, or asked for, for the same commit: nothing is drawn twice.
		await i.warm();
		await i.of('src/components/B/B.stories.tsx');
		expect(asked).toHaveLength(1);
		expect(builds).toHaveLength(1);
	});

	it('waits for the one already building when warmed again, and never fails: a failure is said to whoever asks', async () => {
		const i = index({ measure: async () => Promise.reject(new Error('no windows')) });
		await expect(Promise.all([i.warm(), i.warm()])).resolves.toEqual([undefined, undefined]);
		expect(await i.of('src/components/A/A.stories.tsx')).toEqual({ state: 'failed', error: 'no windows' });
	});

	it('does nothing when there is no design system, or it has no branch to read', async () => {
		await expect(index({ system: () => null }).warm()).resolves.toBeUndefined();
		expect(asked).toHaveLength(0);
	});

	it('keeps the pictures the plain drawing took, of the listed components, and not the tagged ones', async () => {
		const shot = Buffer.from('jpeg');
		const i = index({
			measure: async (runs) =>
				runs.map((run) => run.files.map((f) => ({ ...drawn({ 'rgb(0, 1, 90)': 1 }), ...(run.pictures && f.includes('A.stories') ? { picture: shot } : {}) }))),
		});
		await i.warm();
		expect(kept).toEqual([
			{
				system: 'acme/ui',
				listed: ['src/components/A/A.stories.tsx', 'src/components/B/B.stories.tsx'],
				taken: new Map([['src/components/A/A.stories.tsx', shot]]),
			},
		]);
	});

	it('gives the pictures there are, and says while a pass that may replace them is drawing', async () => {
		let finish: () => void = () => undefined;
		let drawingStarted = false;
		const i = index({
			measure: async (runs) => {
				drawingStarted = true;
				await new Promise<void>((r) => (finish = r));
				return runs.map((run) => run.files.map(() => drawn()));
			},
		});
		void i.warm();
		await vi.waitFor(() => expect(drawingStarted).toBe(true));
		expect(await i.pictures()).toEqual({ drawing: true, pictures: {} });
		finish();
		await i.warm();
		expect((await i.pictures()).drawing).toBe(false);
		expect(await index({ system: () => null }).pictures()).toEqual({ drawing: false, pictures: {} });
	});

	it('still draws and pictures a library with no tokens it can tag, as it is, once, and says it draws with none', async () => {
		// The theme files hold no tone and no palette, so nothing can be tagged: a Storybook library with no tokens read.
		g(clone, 'rm', '-q', 'src/colors/tones/brand.ts', 'src/colors/theme/light.ts');
		g(clone, '-c', 'user.name=T', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'no tokens');
		g(clone, 'update-ref', 'refs/remotes/origin/develop', 'HEAD');
		const shot = Buffer.from('jpeg');
		const i = index({
			measure: async (runs) => (
				asked.push(runs),
				runs.map((run) => run.files.map(() => ({ ...drawn({ 'rgb(107, 114, 128)': 2 }), ...(run.pictures ? { picture: shot } : {}) })))
			),
		});
		await i.warm();
		expect(builds).toHaveLength(0);
		// With no tokens read, the library's own token page is a component like the others (decision 22), and is drawn too.
		// In the catalog's order, by group: Buttons, Design Tokens, Inputs.
		const files = ['src/components/A/A.stories.tsx', 'src/uxDocs/Palette.stories.tsx', 'src/components/B/B.stories.tsx'];
		expect(asked).toEqual([[{ base: 'http://127.0.0.1:1/plain/', mode: 'light', files, pictures: true }]]);
		expect(kept[0]?.taken.size).toBe(3);
		expect(await i.of('src/components/A/A.stories.tsx')).toEqual({
			state: 'ready',
			uses: [],
			sharedWith: {},
			notTokens: [{ kind: 'color', value: 'rgb(107, 114, 128)', uses: 2 }],
			derived: 0,
		});
	});

	it('keeps the pictures when the tagged build fails, and says why which tokens each uses cannot be said', async () => {
		const shot = Buffer.from('jpeg');
		const i = index({
			previews: { ...previews, tagged: async () => ({ state: 'failed' as const, error: 'tags did not build' }) },
			measure: async (runs) => (asked.push(runs), runs.map((run) => run.files.map(() => ({ ...drawn(), ...(run.pictures ? { picture: shot } : {}) })))),
		});
		await i.warm();
		expect(asked[0]).toHaveLength(1);
		expect(kept[0]?.taken.size).toBe(2);
		expect(await i.of('src/components/A/A.stories.tsx')).toEqual({ state: 'failed', error: 'tags did not build' });
	});

	it('has nothing to say when no design system is connected', async () => {
		expect(await index({ system: () => null }).of('x')).toEqual({ state: 'failed', error: 'There is no design system connected.' });
	});
});
