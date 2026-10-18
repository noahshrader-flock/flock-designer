import { expect, it } from 'vitest';
import { PREVIEW_COMPONENT, PREVIEW_TRY, previewAddress } from '../src/shared/catalog';
import { FIND_INSTANCES } from '../src/core/services/designSystem/pageInstances';
import { findChrome } from '../src/core/services/browser/chromeHeadless';
import type { ValueRow } from '../src/shared/contract';
import { REAL_FUI, libraryUnbuilt } from './realCheckouts';
import { describeLibrary, onRealLibrary } from './realLibrary';
import { settledAnswer } from './fixtures';

/** A component's values on Flock's FUI, drawn in real Chrome: read by size, as tokens, tried live, and what a token moves. */

describeLibrary(libraryUnbuilt, REAL_FUI, 'against the real library on origin/develop', () => {
	it.skipIf(findChrome() === null)(
		'reads FSButton’s heights by size, its radius and colors as tokens, and FSIconButton’s radius as its own',
		async () => {
			await onRealLibrary(REAL_FUI, async ({ tokens, previews }) => {
				const valuesIn = async (name: string, mode: 'light' | 'dark') => {
					const answer = await tokens.of(`src/components/${name}/${name}.stories.tsx`);
					if (answer.state !== 'ready' || answer.values.state !== 'read')
						throw new Error(`${name}: ${answer.state === 'ready' ? JSON.stringify(answer.values) : JSON.stringify(answer)}`);
					const rows = answer.values.rows[mode];
					if (rows === null) throw new Error(`${name}: nothing drawn in ${mode}`);
					return rows;
				};
				const valuesOf = (name: string) => valuesIn(name, 'light');
				const row = (rows: ValueRow[], property: ValueRow['property']) => rows.find((r) => r.property === property);
				const button = await valuesOf('FSButton');
				const height = row(button, 'height');
				expect(height?.by).toBe('size');
				// In the order the stories draw them, which is theirs to choose: compared by size.
				const bySize = Object.fromEntries((height?.cells ?? []).map((c) => [c.variant, [c.value, c.kind]]));
				// Drawn without a size, it draws its default, which is lg's.
				expect(bySize).toEqual({ sm: ['28px', 'own'], md: ['36px', 'own'], lg: ['48px', 'own'], xl: ['56px', 'own'], 'not set': ['48px', 'own'] });
				const radius = row(button, 'radius')?.cells ?? [];
				expect(radius.map((c) => [c.value, c.kind])).toEqual([['8px', 'token']]);
				// Its colors by variant: the primary's background is the primary token, the secondary draws none.
				const background = Object.fromEntries((row(button, 'background')?.cells ?? []).map((c) => [c.variant, [c.kind, c.tokens]]));
				expect(background.primary).toEqual(['token', ['palette.light.primary.main']]);
				expect(background.secondary).toEqual(['own', []]);
				// In dark, the same variant is the Dark token written where the light one is, and a value that does not change
				// with the theme (a height) reads as it does in light.
				const dark = await valuesIn('FSButton', 'dark');
				const darkBackground = Object.fromEntries((row(dark, 'background')?.cells ?? []).map((c) => [c.variant, [c.kind, c.tokens]]));
				expect(darkBackground.primary).toEqual(['token', ['palette.dark.primary.main']]);
				expect(row(dark, 'height')?.cells.map((c) => c.value)).toEqual(height?.cells.map((c) => c.value));
				// FSIconButton draws the same 8px, but its own: changing the shared radius would not move it.
				expect(row(await valuesOf('FSIconButton'), 'radius')?.cells.map((c) => [c.value, c.kind])).toEqual([['8px', 'own']]);

				// Tried in the live page, as the tab frames it, narrower than the page it was measured on: the Small cell's instances,
				// found by their keys, are 40px high, every one of them; no other instance moves.
				const small = height?.cells.find((c) => c.variant === 'sm');
				const preview = await previews.preview();
				if (!small || preview.state !== 'ready') throw new Error('no Small cell, or no previews');
				const { inChrome } = await import('./realChrome');
				await inChrome(async (browser) => {
					const tab = await browser.newPage();
					const file = 'src/components/FSButton/FSButton.stories.tsx';
					await tab.setContent(`<iframe src="${previewAddress(preview.base, file)}" style="width:700px;height:900px"></iframe>`);
					const frame = await tab.waitForFrame((f) => f.url().includes('FSButton'));
					await frame.waitForSelector('[data-story] button');
					const heights = () =>
						frame.evaluate(
							(find, component) => {
								const of = (window as unknown as Record<string, { component: unknown } | null>)[component];
								const found = (0, eval)(find)(of?.component) as { instances: { key: string; el: Element }[] };
								return Object.fromEntries(found.instances.map(({ key, el }) => [key, Math.round(el.getBoundingClientRect().height)]));
							},
							FIND_INSTANCES,
							PREVIEW_COMPONENT,
						);
					const before = await heights();
					expect(small.targets.every((key) => key in before)).toBe(true);
					await tab.evaluate((key, v) => document.querySelector('iframe')?.contentWindow?.postMessage({ [key]: v }, '*'), PREVIEW_TRY, [
						{ property: 'height', value: '40px', targets: small.targets },
					] as never);
					await frame.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
					const after = await heights();
					for (const [key, h] of Object.entries(after)) expect(h, key).toBe(small.targets.includes(key) ? 40 : before[key]);
				});
			});
		},
	);

	it.skipIf(findChrome() === null)(
		'says what the shared radius moves: FSButton by its radius, FSTextField inside, and not FSIconButton, whose 8px is its own',
		async () => {
			await onRealLibrary(REAL_FUI, async ({ tokens }) => {
				const file = (name: string) => `src/components/${name}/${name}.stories.tsx`;
				const button = await tokens.of(file('FSButton'));
				if (button.state !== 'ready' || button.values.state !== 'read') throw new Error(JSON.stringify(button));
				// The radius FSButton draws with, as its Values name it.
				const path = button.values.rows.light?.find((r) => r.property === 'radius')?.cells[0]?.tokens[0];
				if (path === undefined) throw new Error('FSButton draws no radius token');
				const edits = [{ path, value: '12px' }];
				const reach = await settledAnswer(
					() => tokens.reach(edits),
					(r) => r.state === 'building',
					{ within: 240_000, every: 1000 },
				);
				if (reach.state !== 'ready') throw new Error(JSON.stringify(reach));
				const moved = new Map(reach.moved.map((m) => [m.file, m]));
				expect(moved.get(file('FSButton'))?.changes).toContainEqual(
					expect.objectContaining({ mode: 'light', property: 'radius', from: '8px', to: '12px' }),
				);
				// Its field's outline is drawn by a part inside it, which its values do not read: moved, inside.
				expect(moved.get(file('FSTextField'))?.inside).toBe(true);
				expect(moved.has(file('FSIconButton'))).toBe(false);
				expect(reach.unchanged).toBeGreaterThan(0);
			});
		},
	);
});
