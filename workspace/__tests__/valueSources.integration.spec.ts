import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { chromeHeadless, findChrome } from '../src/main/services/chromeHeadless';
import { ComponentTokens } from '../src/main/services/componentTokens';
import { PrototypeServer } from '../src/main/services/prototypeServer';
import { StoryPreviews } from '../src/main/services/storyPreviews';
import { ValueSources } from '../src/main/services/valueSources';
import type { ConnectedDesignSystem, ValueProperty, ValueSources as Answer } from '../src/shared/contract';
import { REAL_LIBRARY, REAL_PRIMER, describeWith, libraryMissing, primerMissing } from './realCheckouts';

/**
 * Where a value of a component's own is written (Phase 4), found by its effect on the real libraries on this machine: Flock's
 * FUI, a TypeScript theme, as the spike found it by hand (DESIGN_SYSTEM_PLAN, Phase 0); and Primer React, a monorepo of CSS
 * modules whose tokens come from a package, so the locator is not proved on Flock's alone.
 */
const withLibrary = async (system: ConnectedDesignSystem, check: (tokens: ComponentTokens, sources: ValueSources) => Promise<void>) => {
	const pages = new PrototypeServer();
	const real = chromeHeadless();
	try {
		const previews = new StoryPreviews({ system: () => system, folder: mkdtempSync(join(tmpdir(), 'dsnr-sources-')), server: pages });
		const tokens = new ComponentTokens({ system: () => system, previews, measure: real.measure, pictures: { keep: () => {}, of: async () => ({}) } });
		await tokens.warm();
		await check(tokens, new ValueSources({ tokens, previews, measure: real.measure }));
	} finally {
		await real.close();
		pages.close();
	}
};

/** Where `value` tried on the instances of a component's cell (its property, its variant) is written, once it is found. */
const sourcesOf = async (
	tokens: ComponentTokens,
	sources: ValueSources,
	file: string,
	property: ValueProperty,
	variant: string | null,
	value: string,
) => {
	const answer = await tokens.of(file);
	if (answer.state !== 'ready' || answer.values.state !== 'read') throw new Error(`${file}: ${JSON.stringify(answer).slice(0, 300)}`);
	const cell = answer.values.rows.light?.find((r) => r.property === property)?.cells.find((c) => c.variant === variant);
	if (!cell) throw new Error(`${file} has no ${property} for ${variant}`);
	const tried = [{ property, value, targets: cell.targets }];
	for (let n = 0; n < 600; n++) {
		const found: Answer = await sources.of(file, tried);
		if (found.state !== 'building') return { found, cell };
		await new Promise((r) => setTimeout(r, 500));
	}
	throw new Error('never found');
};
const moved = (found: Answer) => (found.state === 'ready' && found.reach.state === 'ready' ? found.reach.moved.map((m) => m.file) : []);

describeWith(libraryMissing, 'on Flock’s FUI, on origin/develop', () => {
	it.skipIf(findChrome() === null)(
		'finds FSButton’s Small height in the one place of the seven it is written, and FSIconButton’s radius in its own seven; a change that writes nothing moves nothing',
		async () => {
			const repository = 'flocksafety/flock-react-component-lib';
			await withLibrary({ id: repository, name: 'FUI', repository, root: REAL_LIBRARY, folder: '', branch: 'develop' }, async (tokens, sources) => {
				// The library as it is, drawn as a change is: held still, nothing differs (it was sixteen components, drawn otherwise).
				const index = await tokens.drawn();
				if (index.state !== 'ready') throw new Error(JSON.stringify(index));
				const { reach } = await tokens.reachWith(index, async () => new Map(), 'written');
				expect(reach).toEqual({ state: 'ready', moved: [], unchanged: expect.any(Number), notDrawn: expect.any(Array) });

				const button = 'src/components/FSButton/FSButton.stories.tsx';
				const small = await sourcesOf(tokens, sources, button, 'height', 'sm', '32px');
				expect(small.found).toMatchObject({
					state: 'ready',
					values: [{ state: 'found', places: [{ file: 'src/utils/theme.ts', line: 158, written: '28px', writes: '32px' }] }],
				});
				// A size table the button group's buttons share: it moves them too, and FSIconButton, whose sizes are its own, not.
				expect(moved(small.found)).toEqual(expect.arrayContaining([button, 'src/components/FSButtonGroup/FSButtonGroup.stories.tsx']));
				expect(moved(small.found)).not.toContain('src/components/FSIconButton/FSIconButton.stories.tsx');
				expect([...(await sources.files(button, [{ property: 'height', value: '32px', targets: small.cell.targets }])).keys()]).toEqual([
					'src/utils/theme.ts',
				]);

				// FSIconButton's 8px is its own, written for each of its variants in the theme's overrides: every one is where.
				const icon = 'src/components/FSIconButton/FSIconButton.stories.tsx';
				const radius = await sourcesOf(tokens, sources, icon, 'radius', null, '12px 12px 12px 12px');
				expect(radius.found).toMatchObject({ state: 'ready', values: [{ state: 'found' }] });
				const places = radius.found.state === 'ready' && radius.found.values[0]?.state === 'found' ? radius.found.values[0].places : [];
				expect(places.map((p) => [p.file, p.written, p.writes])).toEqual(Array.from({ length: 7 }, () => ['src/utils/theme.ts', '8px', '12px']));
				expect(moved(radius.found)).toContain(icon);
				expect(moved(radius.found)).not.toContain(button);
			});
		},
		1_800_000,
	);
});

describeWith(primerMissing, 'on Primer React, the second library', () => {
	it.skipIf(findChrome() === null)(
		'finds CounterLabel’s radius in its CSS module, and says Label’s comes from a package, so it cannot be saved yet',
		async () => {
			const system = { id: 'primer/react', name: 'Primer', repository: 'primer/react', root: REAL_PRIMER, folder: 'packages/react', branch: 'main' };
			await withLibrary(system, async (tokens, sources) => {
				const counter = 'packages/react/src/CounterLabel/CounterLabel.stories.tsx';
				const { found } = await sourcesOf(tokens, sources, counter, 'radius', null, '4px 4px 4px 4px');
				expect(found).toMatchObject({
					state: 'ready',
					values: [{ state: 'found', places: [{ file: 'packages/react/src/CounterLabel/CounterLabel.module.css', written: '20px', writes: '4px' }] }],
				});
				expect(moved(found)).toContain(counter);
				const label = await sourcesOf(tokens, sources, 'packages/react/src/Label/Label.stories.tsx', 'radius', null, '4px 4px 4px 4px');
				expect(label.found).toMatchObject({
					state: 'ready',
					values: [{ state: 'refused', why: expect.stringMatching(/^9999px is not written in the design system's own files/) }],
				});
			});
		},
		1_800_000,
	);
});
