import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { chromeHeadless, findChrome } from '../src/main/services/chromeHeadless';
import { ComponentTokens } from '../src/main/services/componentTokens';
import { PrototypeServer } from '../src/main/services/prototypeServer';
import { StoryPreviews } from '../src/main/services/storyPreviews';
import { ValueSources } from '../src/main/services/valueSources';
import { ValueAgent } from '../src/main/services/valueAgent';
import { runToEnd } from '../src/main/services/agent';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
		await check(tokens, new ValueSources({ tokens, previews, measure: real.measure, agent: { of: () => null } }));
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

/**
 * The agent writing what the locator cannot, on FUI (Phase 4.5, 4.6), as the spike did it: run only where it is asked for
 * (`DSNR_REAL_AGENT=1`), since it runs Claude Code on the person's account and costs a little.
 */
const agentMissing = process.env.DSNR_REAL_AGENT === '1' ? libraryMissing : 'the agent is run only with DSNR_REAL_AGENT=1 (it costs a little)';
describeWith(agentMissing, 'the agent on Flock’s FUI', () => {
	it.skipIf(findChrome() === null)(
		'writes FSBadge’s radius, which MUI sets, as the theme’s override, and makes FSIconButton’s own radius follow the shared one',
		async () => {
			const repository = 'flocksafety/flock-react-component-lib';
			const system = { id: repository, name: 'FUI', repository, root: REAL_LIBRARY, folder: '', branch: 'develop' };
			const pages = new PrototypeServer();
			const real = chromeHeadless();
			try {
				const previews = new StoryPreviews({ system: () => system, folder: mkdtempSync(join(tmpdir(), 'dsnr-agent-')), server: pages });
				const tokens = new ComponentTokens({
					system: () => system,
					previews,
					measure: real.measure,
					pictures: { keep: () => {}, of: async () => ({}) },
				});
				await tokens.warm();
				const agent = new ValueAgent({
					system: () => system,
					tokens,
					run: (cwd, task) => runToEnd(cwd, task),
					readStandard: async (path) => readFileSync(resolve(__dirname, '..', '..', path), 'utf8'),
				});
				const sources = new ValueSources({ tokens, previews, measure: real.measure, agent });
				const answerOf = async (file: string, t: { property: ValueProperty; value: string; targets: string[]; follows?: string }) => {
					for (let n = 0; n < 900; n++) {
						const a: Answer = await sources.of(file, [t]);
						if (a.state !== 'building' && !(a.state === 'ready' && a.values[0]?.state === 'writing')) return a;
						await new Promise((r) => setTimeout(r, 1000));
					}
					throw new Error('never answered');
				};
				const badge = 'src/components/FSBadge/FSBadge.stories.tsx';
				const cell = await sourcesOf(tokens, sources, badge, 'radius', null, '6px 6px 6px 6px');
				expect(cell.found).toMatchObject({ state: 'ready', values: [{ state: 'refused', agent: 'write' }] });
				const six = { property: 'radius' as const, value: '6px 6px 6px 6px', targets: cell.cell.targets };
				await agent.write(badge, six);
				const written = await answerOf(badge, six);
				expect(written).toMatchObject({ state: 'ready', values: [{ state: 'found', by: 'agent' }] });
				expect([...(await sources.files(badge, [six])).keys()]).toEqual(['src/utils/theme.ts']);

				const icon = 'src/components/FSIconButton/FSIconButton.stories.tsx';
				const radius = await sourcesOf(tokens, sources, icon, 'radius', null, '8px 8px 8px 8px');
				const follow = { property: 'radius' as const, value: radius.cell.value, targets: radius.cell.targets, follows: 'radius' };
				await agent.write(icon, follow);
				expect(await answerOf(icon, follow)).toMatchObject({ state: 'ready', values: [{ state: 'found', by: 'agent' }] });
			} finally {
				await real.close();
				pages.close();
			}
		},
		1_800_000,
	);
});
