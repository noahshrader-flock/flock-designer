import { execFileSync } from 'node:child_process';
import { expect, it } from 'vitest';
import { libraryReads } from '../src/main/services/designLibrary';
import { readTokens } from '../src/main/services/designTokens';
import { editedFiles } from '../src/main/services/tokenEdits';
import { REAL_LIBRARY, describeWith, realDevelop } from './realCheckouts';

/** The reader against the real library's `develop`, as the app reads it. */
const DEVELOP = 'refs/remotes/origin/develop';
const missing = realDevelop === null ? `no clone of the design system with develop at ${REAL_LIBRARY} (set FUI_ROOT)` : null;
const find = (list: Awaited<ReturnType<typeof readTokens>>, path: string) => list.tokens.find((t) => t.path === path);

describeWith(missing, 'against the real library', () => {
	const real = libraryReads(REAL_LIBRARY, DEVELOP);

	it('reads every tone, both palettes, spacing and radius; all it cannot read is a tone step written wrong in the library', async () => {
		const list = await readTokens(real);
		// On 2026-10-09, three of neutral's steps: 94 is '@ECEEEB', 70 'AEB0B2' and 4 '0B0F0D'. The library's to fix; never guessed here.
		expect(list.problems.map((p) => p.reason)).toEqual(list.problems.map(() => expect.stringMatching(/not a hex color/)));
		expect(list.problems.every((p) => p.file.startsWith('src/colors/tones/'))).toBe(true);
		expect(new Set(list.tokens.filter((t) => t.group === 'Tones').map((t) => t.set)).size).toBeGreaterThanOrEqual(11);
		// The library's values are its own to change: what is checked is how they relate, not what they are today.
		const tone = find(list, 'tone.pineGreen.50')?.value;
		expect(tone).toMatch(/^#[0-9A-F]{6}$/i);
		expect(find(list, 'palette.light.primary.main')).toMatchObject({ value: tone, ref: { path: 'tone.pineGreen.50' } });
		expect(find(list, 'palette.dark.primary.main')?.ref?.path).toMatch(/^tone\.pineGreen\./);
		expect(find(list, 'palette.light.primaryBorder.main')?.ref?.alpha).toBe('66');
		expect(find(list, 'palette.light.priority0.main')?.source.file).toBe('src/colors/theme/shared.ts');
		expect(find(list, 'spacing')?.value).toMatch(/^\d+px$/);
		expect(find(list, 'radius')?.value).toMatch(/^\d+px$/);
	});

	it('puts the semantic colors, light and dark, before the raw tones they are made from', async () => {
		const list = await readTokens(real);
		const groups = [...new Set(list.tokens.filter((t) => t.category === 'Color').map((t) => t.group))];
		expect(groups).toEqual(['Light', 'Dark', 'Tones']);
	});

	it('gives every color as a hex, every token once', async () => {
		const list = await readTokens(real);
		for (const t of list.tokens.filter((x) => x.kind === 'color')) expect(t.value, t.path).toMatch(/^#([0-9A-F]{6}|[0-9A-F]{8})$/i);
		expect(new Set(list.tokens.map((t) => t.path)).size).toBe(list.tokens.length);
	});
});

describeWith(missing, 'changing the real library’s tokens (T3)', () => {
	it('writes a tone, a role pointed at another step, a role’s own color, and the spacing, each reading back exactly', async () => {
		const real = libraryReads(REAL_LIBRARY, DEVELOP);
		const written = await editedFiles(real, [
			{ path: 'tone.pineGreen.50', value: '#0A6B52' },
			{ path: 'palette.dark.primary.main', ref: 'tone.pineGreen.60' },
			{ path: 'palette.light.priority0.main', value: '#123456' },
			{ path: 'spacing', value: '6px' },
		]);
		// The tone, the dark palette, the palette both modes share (so Light and Dark priority0 change together), the theme.
		expect([...written.keys()]).toEqual(
			expect.arrayContaining(['src/colors/tones/pineGreen.ts', 'src/colors/theme/dark.ts', 'src/colors/theme/shared.ts']),
		);
		expect(written.size).toBe(4);
		// Only the token's own text changes: one line in each file.
		for (const [file, text] of written) {
			const before = (await real.readFile(file)).split('\n');
			expect(text.split('\n').filter((line, i) => line !== before[i])).toHaveLength(1);
		}
	});
});

describeWith(missing, 'reading the real library’s files exactly', () => {
	it('gives each file as committed, white space at its ends and all, read alone or with the stories', async () => {
		const real = libraryReads(REAL_LIBRARY, DEVELOP);
		const files = await real.listFiles('');
		const story = files.find((f) => /FSButton\.stories\.tsx$/.test(f)) as string;
		for (const path of ['src/colors/tones/neutral.ts', story]) {
			const exact = execFileSync('git', ['-C', REAL_LIBRARY, 'show', `${DEVELOP}:${path}`], { encoding: 'utf8' });
			expect(await real.readFile(path)).toBe(exact);
		}
	});
});
