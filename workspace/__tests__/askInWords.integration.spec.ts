import { expect, it } from 'vitest';
import { runToEnd } from '../src/main/services/agent';
import { AskInWords } from '../src/main/services/askInWords';
import { findChrome } from '../src/main/services/chromeHeadless';
import { REAL_LIBRARY, describeWith, libraryMissing } from './realCheckouts';
import { onRealLibrary } from './realLibrary';
import { settledAnswer } from './fixtures';

/**
 * Asking in words on Flock's FUI with the real agent (Phase 6): run only where it is asked for (`DSNR_REAL_AGENT=1`), since
 * it runs Claude Code on the person's account and costs a little. What comes back has passed every rule a control's change
 * does; this says it is the change the words mean.
 */
const agentMissing = process.env.DSNR_REAL_AGENT === '1' ? libraryMissing : 'the agent is run only with DSNR_REAL_AGENT=1 (it costs a little)';
describeWith(agentMissing, 'asking in words on Flock’s FUI', () => {
	it.skipIf(findChrome() === null)(
		'makes “a little warmer” an edit of the primary’s colour, and “30px high” FSButton’s small height',
		async () => {
			const repository = 'flocksafety/flock-react-component-lib';
			const system = { id: repository, name: 'FUI', repository, root: REAL_LIBRARY, folder: '', branch: 'develop' };
			await onRealLibrary(system, async ({ tokens }) => {
				const ask = new AskInWords({ tokens, run: (cwd, task) => runToEnd(cwd, task) });
				const button = 'src/components/FSButton/FSButton.stories.tsx';
				// Its values read first, as its tab shows them before anyone asks.
				await settledAnswer(
					() => tokens.of(button),
					(x) => x.state === 'building',
					{ within: 600_000, every: 500 },
				);
				const warmer = await ask.ask(null, 'make the primary a little warmer', { edits: [], tried: [] });
				const index = await tokens.drawn();
				if (index.state !== 'ready') throw new Error(JSON.stringify(index));
				const primary = index.built.reading.tokens.find((t) => t.path === 'palette.light.primary.main');
				// The primary, or the tone step it points at, which moves it.
				expect(warmer.edits.map((e) => e.path)).toEqual(
					expect.arrayContaining([expect.stringMatching(new RegExp(`primary|${primary?.ref?.path ?? 'primary'}`))]),
				);
				const taller = await ask.ask(button, 'make the small size 30px high', { edits: [], tried: [] });
				expect(taller.values).toEqual([expect.objectContaining({ property: 'height', value: '30px' })]);
				expect(taller.edits).toEqual([]);
			});
		},
		1_800_000,
	);
});
