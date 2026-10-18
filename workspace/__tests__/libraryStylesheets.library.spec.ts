import { expect, it } from 'vitest';
import { findChrome } from '../src/main/services/chromeHeadless';
import type { ComponentTokens } from '../src/main/services/componentTokens';
import { ValueSources } from '../src/main/services/valueSources';
import type { ChangeReach, ValueProperty, ValueSources as Sources } from '../src/shared/contract';
import { settledAnswer } from './fixtures';
import { REAL_PRIMER_SYSTEM, REAL_TREMOR3_SYSTEM, REAL_TREMOR4_SYSTEM, primerMissing, tremor3Missing, tremor4Missing } from './realCheckouts';
import { describeLibrary, onRealLibrary } from './realLibrary';

/**
 * A library's stylesheets as its own Storybook makes them (Phase 5.5), on two real libraries whose values are in classes:
 * Tremor's, on Tailwind 3 (its theme a JavaScript configuration, run locked down) and on Tailwind 4 (its theme in CSS, which
 * the tokens are read from). Nothing here or in what it tests names Tailwind: each library's own PostCSS configuration does.
 * What each reads is what its classes say: `rounded-md border px-3 py-2 text-sm` is a 6px radius, 8 by 12 padding, 14px.
 */
/** A component's values once its library is read: by property, in light or in dark, every value its stories draw. */
const valuesOf = async (tokens: ComponentTokens, file: string) => {
	const a = await settledAnswer(
		() => tokens.of(file),
		(x) => x.state === 'building',
		{ within: 240_000, every: 500 },
	);
	if (a.state !== 'ready' || a.values.state !== 'read') throw new Error(`not read: ${JSON.stringify(a).slice(0, 400)}`);
	const { rows } = a.values;
	return {
		uses: a.uses.map((u) => u.path),
		cell: (property: ValueProperty, value: string) => rows.light?.find((r) => r.property === property)?.cells.find((c) => c.value === value),
		drawn: (property: ValueProperty, mode: 'light' | 'dark' = 'light') =>
			(rows[mode] ?? []).find((r) => r.property === property)?.cells.map((c) => c.value) ?? [],
	};
};

describeLibrary(primerMissing, REAL_PRIMER_SYSTEM, 'Primer React, which goes dark by a setting its own Storybook declares', () => {
	it.skipIf(findChrome() === null)(
		'draws a label and a button dark, though its setting is not the themes addon’s `theme`: read from what its preview declares',
		async () => {
			await onRealLibrary(REAL_PRIMER_SYSTEM, async ({ previews, measure }) => {
				const built = await previews.preview();
				if (built.state !== 'ready') throw new Error(`not built: ${JSON.stringify(built).slice(0, 300)}`);
				for (const file of ['packages/react/src/Label/Label.stories.tsx', 'packages/react/src/Button/Button.stories.tsx']) {
					const drawn = await measure([
						{ base: built.base, mode: 'light', files: [file] },
						{ base: built.base, mode: 'dark', files: [file] },
					]);
					// The colors it draws in light are other ones in dark: its page is dark, so its text and its fills are too.
					const [light, dark] = [0, 1].map((run) => Object.keys(drawn[run]?.[0]?.colors ?? {}).sort());
					expect(light?.length, file).toBeGreaterThan(0);
					expect(dark, file).not.toEqual(light);
				}
			});
		},
	);
});

describeLibrary(tremor3Missing, REAL_TREMOR3_SYSTEM, 'Tremor on Tailwind 3', () => {
	it.skipIf(findChrome() === null)(
		'draws its button as its classes say, and its card dark as its Storybook does, through its own configuration',
		async () => {
			await onRealLibrary(REAL_TREMOR3_SYSTEM, async ({ tokens }) => {
				const button = await valuesOf(tokens, 'src/stories/input-elements/Button.stories.tsx');
				// Size sm, its default: `px-4 py-2 text-sm`, its theme's `rounded-tremor-default` (0.5rem).
				expect(button.drawn('padding')).toContain('8px 16px');
				expect(button.drawn('radius')).toContain('8px');
				expect(button.drawn('fontSize')).toContain('14px');
				expect(button.drawn('height')).toContain('38px');
				// Its dark is its themes addon's `data-mode="dark"`: its theme's dark background, not its light white.
				const card = await valuesOf(tokens, 'src/stories/layout-elements/Card.stories.tsx');
				expect(card.drawn('background')).toContain('rgb(255, 255, 255)');
				expect(card.drawn('background', 'dark')).toContain('rgb(17, 24, 39)');
			});
		},
	);
});

/** The story files a change moved, once what it reaches is drawn. */
const movedBy = (reach: ChangeReach) => (reach.state === 'ready' ? reach.moved.map((m) => m.file) : []);

describeLibrary(tremor3Missing, REAL_TREMOR3_SYSTEM, 'Tremor on Tailwind 3, where a value is', () => {
	it.skipIf(findChrome() === null)(
		'finds its button’s radius in its theme’s configuration, a value its classes name, written there, and what else it moves',
		async () => {
			await onRealLibrary(REAL_TREMOR3_SYSTEM, async ({ tokens, previews, measure }) => {
				const file = 'src/stories/input-elements/Button.stories.tsx';
				const cell = (await valuesOf(tokens, file)).cell('radius', '8px');
				if (!cell) throw new Error('no 8px radius drawn');
				const sources = new ValueSources({ tokens, previews, measure, agent: { of: () => null } });
				const tried = [{ property: 'radius' as const, value: '12px 12px 12px 12px', targets: cell.targets }];
				const found = await settledAnswer(
					(): Promise<Sources> => sources.of(file, tried),
					(a) => a.state === 'building',
					{ within: 240_000, every: 500 },
				);
				// `rounded-tremor-default` is 0.5rem in its configuration: found by its effect, its configuration made again with it.
				expect(found).toMatchObject({
					state: 'ready',
					values: [{ state: 'found', places: [{ file: 'tailwind.config.js', line: 86, written: '0.5rem', writes: '0.75rem' }] }],
				});
				expect(found.state === 'ready' && movedBy(found.reach)).toEqual(
					expect.arrayContaining([file, 'src/stories/layout-elements/Card.stories.tsx']),
				);
			});
		},
	);
});

describeLibrary(tremor4Missing, REAL_TREMOR4_SYSTEM, 'Tremor on Tailwind 4', () => {
	it.skipIf(findChrome() === null)('draws its button as its classes say, its radius and spacing the theme’s tokens, and its card dark', async () => {
		await onRealLibrary(REAL_TREMOR4_SYSTEM, async ({ tokens }) => {
			const button = await valuesOf(tokens, 'src/components/Button/button.stories.tsx');
			expect(button.drawn('padding')).toContain('8px 12px');
			expect(button.drawn('radius')).toContain('6px');
			expect(button.drawn('fontSize')).toContain('14px');
			expect(button.drawn('height')).toContain('38px');
			// Tailwind's theme, which its stylesheet imports, is its tokens: `rounded-md` is `--radius-md`, `px-3` three `--spacing`.
			expect(button.uses).toEqual(expect.arrayContaining(['css.light.radius-md', 'css.light.spacing']));
			const card = await valuesOf(tokens, 'src/components/Card/card.stories.tsx');
			expect(card.drawn('background')).toContain('rgb(255, 255, 255)');
			expect(card.drawn('background', 'dark')).toContain('rgb(9, 14, 26)');
		});
	});
});

describeLibrary(tremor4Missing, REAL_TREMOR4_SYSTEM, 'Tremor on Tailwind 4, a token changed', () => {
	it.skipIf(findChrome() === null)('moves what uses Tailwind’s radius, declared again in its own stylesheet, and leaves what does not', async () => {
		await onRealLibrary(REAL_TREMOR4_SYSTEM, async ({ tokens }) => {
			await valuesOf(tokens, 'src/components/Button/button.stories.tsx');
			const reach = await settledAnswer(
				() => tokens.reach([{ path: 'css.light.radius-md', value: '12px' }]),
				(r) => r.state === 'building',
				{ within: 240_000, every: 500 },
			);
			expect(reach.state).toBe('ready');
			expect(movedBy(reach)).toContain('src/components/Button/button.stories.tsx');
			// A component drawn with no radius of Tailwind's own is not one it moves.
			expect(movedBy(reach)).not.toContain('src/components/Divider/divider.stories.tsx');
		});
	});
});
