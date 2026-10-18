import { expect, it, vi } from 'vitest';
import { PrototypeServer } from '../src/main/services/prototypeServer';
import { StoryPreviews } from '../src/main/services/storyPreviews';
import { REAL_FUI, describeWith, libraryUnbuilt } from './realCheckouts';
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

/**
 * The real library on this machine, not a fixture: every one of develop's story files builds into the page, built with
 * the clone's own packages and nothing fetched.
 */
describeWith(libraryUnbuilt, 'against the real library on origin/develop', () => {
	it('builds every story file with the clone’s own packages, and serves it', async () => {
		const real = new PrototypeServer();
		try {
			const r = await new StoryPreviews({ system: () => REAL_FUI, folder: libraryFolder(REAL_FUI), server: real }).preview();
			expect(r.state).toBe('ready');
			if (r.state !== 'ready') return;
			expect((await fetch(r.base)).status).toBe(200);
			const entry = await (await fetch(`${r.base}entry.js`)).text();
			expect(entry).toContain('FSButton');
		} finally {
			real.close();
		}
	}, 120_000);

	it('tries each change to a tone on one build kept open: rebuilt each time, with the Sass compiled once', async () => {
		const real = new PrototypeServer();
		try {
			const p = new StoryPreviews({ system: () => REAL_FUI, folder: libraryFolder(REAL_FUI), server: real });
			expect((await p.preview()).state).toBe('ready');
			const times: number[] = [];
			const after: Array<typeof counted> = [];
			for (const value of ['#0A6B52', '#0B7055', '#0C7558']) {
				const started = performance.now();
				const r = await p.preview([{ path: 'tone.pineGreen.50', value }]);
				times.push(Math.round(performance.now() - started));
				after.push({ ...counted });
				expect(r.state).toBe('ready');
			}
			// How long, for whoever reads the output; not asserted, since a busy machine's clock says nothing of the code.
			console.log(`trying a change on the real library: ${times.join(' ms, ')} ms`);
			// The first change opens the build (and opens it again if it has to set aside what is not installed); each
			// after is one rebuild of it, and a change to a tone touches no Sass, so none is compiled again.
			const [first, , last] = after as [typeof counted, typeof counted, typeof counted];
			expect(last.contexts).toBe(first.contexts);
			expect(last.rebuilds - first.rebuilds).toBe(2);
			expect(last.sass).toBe(first.sass);
		} finally {
			real.close();
		}
	}, 180_000);
});
