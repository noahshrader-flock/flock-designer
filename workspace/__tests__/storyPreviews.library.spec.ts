import { expect, it, vi } from 'vitest';
import { PrototypeServer } from '../src/core/services/prototypes/prototypeServer';
import { StoryPreviews } from '../src/core/services/designSystem/storyPreviews';
import { readCatalog } from '../src/core/services/designSystem/componentCatalog';
import { readTokens } from '../src/core/services/designSystem/designTokens';
import { designSystemOf } from '../src/shared/catalog';
import { EVERY_LIBRARY, describeWith, readsOf } from './realCheckouts';
import { aColorAndALength } from './tokenFixtures';
import { libraryFolder } from './realLibrary';

/**
 * What the builds do, counted on the real esbuild and Sass, so a test can say how a change is built (one build kept
 * open, rebuilt each time, the Sass compiled once) rather than how long it took on a busy machine.
 */
const counted = vi.hoisted(() => ({ contexts: 0, rebuilds: 0, sass: 0 }));
vi.mock('esbuild', async (original) => {
	const real = await original<typeof import('esbuild')>();
	return {
		...real,
		context: async (options: Parameters<typeof real.context>[0]) => {
			counted.contexts++;
			const open = await real.context(options);
			return Object.assign(Object.create(open) as typeof open, {
				rebuild: () => (counted.rebuilds++, open.rebuild()),
			});
		},
	};
});
vi.mock('sass', async (original) => {
	const real = await original<typeof import('sass')>();
	return {
		...real,
		compile: (...a: Parameters<typeof real.compile>) => (counted.sass++, real.compile(...a)),
		compileString: (...a: Parameters<typeof real.compileString>) => (counted.sass++, real.compileString(...a)),
	};
});

for (const { key, system, missing, tokens } of EVERY_LIBRARY)
	describeWith(missing, `the previews of ${key}`, () => {
		it('builds every story file with the clone’s own packages, and serves it', async () => {
			const real = new PrototypeServer();
			try {
				const r = await new StoryPreviews({ system: () => system, folder: libraryFolder(system), server: real }).preview();
				expect(r.state).toBe('ready');
				if (r.state !== 'ready') return;
				expect((await fetch(r.base)).status).toBe(200);
				const [first] = await readCatalog(await readsOf(system), designSystemOf(system));
				expect(await (await fetch(`${r.base}entry.js`)).text()).toContain(first?.name);
			} finally {
				real.close();
			}
		}, 300_000);

		it.skipIf(!tokens)(
			'tries each change to a token on one build kept open: rebuilt each time, no Sass compiled again',
			async () => {
				const real = new PrototypeServer();
				try {
					const p = new StoryPreviews({ system: () => system, folder: libraryFolder(system), server: real });
					expect((await p.preview()).state).toBe('ready');
					const [color] = aColorAndALength((await readTokens(await readsOf(system))).tokens);
					if (!color) throw new Error(`${key} has no color of its own to change`);
					const times: number[] = [];
					const after: Array<typeof counted> = [];
					for (const value of ['#0A6B52', '#0B7055', '#0C7558']) {
						const started = performance.now();
						const r = await p.preview([{ path: color.path, value }]);
						times.push(Math.round(performance.now() - started));
						after.push({ ...counted });
						expect(r.state).toBe('ready');
					}
					// Not asserted: a busy machine's clock says nothing of the code.
					console.log(`trying a change on ${key}: ${times.join(' ms, ')} ms`);
					// The first change opens the build (and opens it again if it has to set aside what is not installed); each
					// after is one rebuild of it, and a change to a token's value touches no Sass, so none is compiled again.
					const [first, , last] = after as [typeof counted, typeof counted, typeof counted];
					expect(last.contexts).toBe(first.contexts);
					expect(last.rebuilds - first.rebuilds).toBe(2);
					expect(last.sass).toBe(first.sass);
				} finally {
					real.close();
				}
			},
			300_000,
		);
	});
