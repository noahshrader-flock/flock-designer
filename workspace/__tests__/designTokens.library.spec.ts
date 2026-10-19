import { execFileSync } from 'node:child_process';
import { expect, it } from 'vitest';
import { readTokens } from '../src/core/services/designSystem/designTokens';
import { editedFiles } from '../src/core/services/designSystem/tokenEdits';
import { libraryCommit } from '../src/core/services/designSystem/designLibrary';
import { overlaid } from '../src/core/services/designSystem/componentCatalog';
import { COLOR_WRITTEN } from '../src/shared/tokens';
import { EVERY_LIBRARY, describeWith, libraryRow, readsOf } from './realCheckouts';
import { aColorAndALength } from './tokenFixtures';

const find = (list: Awaited<ReturnType<typeof readTokens>>, path: string) => list.tokens.find((t) => t.path === path);

for (const { key, system, missing, tokens } of EVERY_LIBRARY)
	describeWith(missing, `the tokens of ${key}`, () => {
		it('gives every token once, every color as one DSNR reads, and says the file and why of each it cannot read', async () => {
			const list = await readTokens(await readsOf(system));
			expect(new Set(list.tokens.map((t) => t.path)).size).toBe(list.tokens.length);
			// A hex, or a color function as the library writes it (DESIGN_SYSTEM.md: `oklch` and the rest).
			for (const t of list.tokens.filter((x) => x.kind === 'color')) expect(t.value, t.path).toMatch(COLOR_WRITTEN);
			for (const p of list.problems) expect([p.file, p.reason].every((s) => s.length > 0)).toBe(true);
		});

		it.runIf(!tokens)('has no tokens DSNR reads, and says so', async () => {
			expect(await readTokens(await readsOf(system))).toMatchObject({ source: null, tokens: [] });
		});

		it.skipIf(!tokens)('writes a color and a length it reads, and reads each back exactly as written', async () => {
			const reads = await readsOf(system);
			const list = await readTokens(reads);
			const edits = aColorAndALength(list.tokens);
			expect(edits.map((e) => (find(list, e.path)?.kind === 'color' ? 'color' : 'length'))).toEqual(['color', 'length']);
			const written = await editedFiles(reads, edits);
			const again = await readTokens(overlaid(reads, written));
			for (const e of edits) expect(find(again, e.path)?.value.toUpperCase(), e.path).toBe(e.value.toUpperCase());
			// Nothing else moved: every token not written, nor pointing at one written, reads as it did.
			const touched = new Set(edits.map((e) => e.path));
			for (const t of list.tokens.filter((x) => !touched.has(x.path) && !touched.has(x.ref?.path ?? '')))
				expect(find(again, t.path)?.value, t.path).toBe(t.value);
		});

		it('gives each file as committed, white space at its ends and all', async () => {
			const reads = await readsOf(system);
			const list = await readTokens(reads);
			const story = (await reads.listFiles('')).find((f) => /\.stories\.[jt]sx?$/.test(f)) as string;
			const commit = (await libraryCommit(system.root, system.branch)) as string;
			for (const path of [...new Set([story, ...list.tokens.slice(0, 1).map((t) => t.source.file)])]) {
				const exact = execFileSync('git', ['-C', system.root, 'show', `${commit}:${path}`], { encoding: 'utf8', maxBuffer: 1e8 });
				expect(await reads.readFile(path), path).toBe(exact);
			}
		});
	});

const fui = libraryRow('FUI');
describeWith(fui.missing, 'FUI’s own tokens', () => {
	it('are its tones, both palettes, spacing and radius; all it cannot read is a tone step the library wrote wrong', async () => {
		const list = await readTokens(await readsOf(fui.system));
		// Some of neutral's steps are written wrong (such as '@ECEEEB' or 'AEB0B2'). The library's to fix; never guessed here.
		expect(list.problems.map((p) => p.reason)).toEqual(list.problems.map(() => expect.stringMatching(/not a hex color/)));
		expect(list.problems.every((p) => p.file.startsWith('src/colors/tones/'))).toBe(true);
		expect(new Set(list.tokens.filter((t) => t.group === 'Tones').map((t) => t.set)).size).toBeGreaterThanOrEqual(11);
		// The library's values are its own to change: what is checked is how they relate, not what they are today.
		const tone = find(list, 'tone.pineGreen.50')?.value;
		expect(find(list, 'palette.light.primary.main')).toMatchObject({ value: tone, ref: { path: 'tone.pineGreen.50' } });
		expect(find(list, 'palette.dark.primary.main')?.ref?.path).toMatch(/^tone\.pineGreen\./);
		expect(find(list, 'palette.light.primaryBorder.main')?.ref?.alpha).toBe('66');
		expect(find(list, 'palette.light.priority0.main')?.source.file).toBe('src/colors/theme/shared.ts');
		const groups = [...new Set(list.tokens.filter((t) => t.category === 'Color').map((t) => t.group))];
		expect(groups).toEqual(['Light', 'Dark', 'Tones']);
	});

	it('writes a tone, a role pointed at another step, a role both modes share, and the spacing: one line in each file', async () => {
		const reads = await readsOf(fui.system);
		const written = await editedFiles(reads, [
			{ path: 'tone.pineGreen.50', value: '#0A6B52' },
			{ path: 'palette.dark.primary.main', ref: 'tone.pineGreen.60' },
			{ path: 'palette.light.priority0.main', value: '#123456' },
			{ path: 'spacing', value: '6px' },
		]);
		expect([...written.keys()]).toEqual(
			expect.arrayContaining(['src/colors/tones/pineGreen.ts', 'src/colors/theme/dark.ts', 'src/colors/theme/shared.ts']),
		);
		expect(written.size).toBe(4);
		for (const [file, text] of written) {
			const before = (await reads.readFile(file)).split('\n');
			expect(text.split('\n').filter((line, i) => line !== before[i])).toHaveLength(1);
		}
	});
});

const paradome = libraryRow('Paradome');
describeWith(paradome.missing, 'Paradome’s own tokens', () => {
	it('are its token script’s, scales and both modes’ roles pointing at their steps, and nothing of a stylesheet nothing loads', async () => {
		const list = await readTokens(await readsOf(paradome.system));
		expect(list.source).toBe('token scripts');
		expect([...new Set(list.tokens.map((t) => t.source.file))]).toEqual(['src/constants/design/design-tokens.ts']);
		expect(list.tokens.some((t) => t.source.file.includes('oldStyleVars'))).toBe(false);
		expect(find(list, 'TOKENS.colors.light.primary.main')?.ref?.path).toMatch(/^baseColors\.gray\.\d+$/);
		expect(find(list, 'TOKENS.colors.dark.primary.main')?.ref?.path).toMatch(/^baseColors\.gray\.\d+$/);
		expect(['Spacing', 'Shape', 'Typography', 'Breakpoints', 'Motion', 'Elevation'].every((c) => list.tokens.some((t) => t.category === c))).toBe(
			true,
		);
		// What it cannot read is said: a color worked out by code, never guessed.
		expect(list.problems.every((p) => /worked out by code/.test(p.reason))).toBe(true);
	});

	it('writes a scale step and a spacing in place, the spacing still a number, each reading back exactly', async () => {
		const reads = await readsOf(paradome.system);
		const written = await editedFiles(reads, [
			{ path: 'baseColors.brandPink.500', value: '#E0006A' },
			{ path: 'TOKENS.spacing.unit', value: '5px' },
		]);
		const text = written.get('src/constants/design/design-tokens.ts') as string;
		const before = (await reads.readFile('src/constants/design/design-tokens.ts')).split('\n');
		expect(
			text
				.split('\n')
				.filter((line, i) => line !== before[i])
				.map((l) => l.trim()),
		).toEqual(["500: '#E0006A',", 'unit: 5,']);
	});
});
