import { rmSync } from 'node:fs';
import { alias } from './alias.config';
import { sealedEnv } from './__tests__/sealed.mjs';
import { pageCode } from './pageCode.vite';
import { defineConfig } from 'vitest/config';

// One sealed world for the whole run (`sealed.mjs`), removed when it ends.
const sealed = sealedEnv();
process.once('exit', () => rmSync(sealed.base, { recursive: true, force: true }));

export default defineConfig({
	// The same `@/` alias the viewer's build uses, so a component can be imported by a test as it is by the app.
	resolve: { alias },
	// The page code as the builds have it: the scripts run in a page are its bundle (`pageCode.vite.ts`).
	plugins: [pageCode()],
	// React's own JSX transform for every file, the page's viewer (src/viewer) included, as the builds use.
	esbuild: { jsx: 'automatic' },
	test: {
		// Every test, and every process one starts, in the sealed world: no home, token, `gh` or push of the person's.
		env: sealed.env,
		projects: [
			// Code alone: no process is started, so these are fast and run side by side.
			{
				extends: true,
				test: {
					name: 'unit',
					include: ['__tests__/**/*.spec.ts'],
					exclude: ['__tests__/**/*.integration.spec.ts', '__tests__/**/*.dom.spec.ts', '__tests__/**/*.library.spec.ts'],
				},
			},
			// The same, for what draws the window or runs in a page: given a document to draw in.
			{ extends: true, test: { name: 'dom', include: ['__tests__/**/*.dom.spec.ts'], environment: 'jsdom' } },
			// Real git, esbuild and the real library. Fewer at once and more time each: they share one machine's disk and
			// processor, and a test that waits on a busy machine is not a test that failed.
			// They run after the rest (their own group), so one filter can name both kinds of file: vitest refuses projects
			// that share a group but not how many run at once.
			{
				extends: true,
				test: {
					name: 'integration',
					include: ['__tests__/**/*.integration.spec.ts'],
					maxWorkers: '50%',
					testTimeout: 30_000,
					sequence: { groupOrder: 1 },
				},
			},
			// The real libraries on this machine (`realCheckouts.ts`): not in `check`, run by `check:full`. One file at a time in one
			// worker that keeps its modules, so each library is drawn once for the whole run (`realLibrary.ts`) into a folder kept
			// between runs, and no two builds of one library share a folder at once. No test may take more than five minutes; a
			// library's first drawing is in its block's set-up, which says how long it took.
			{
				extends: true,
				test: {
					name: 'library',
					include: ['__tests__/**/*.library.spec.ts'],
					fileParallelism: false,
					isolate: false,
					testTimeout: 300_000,
					hookTimeout: 1_800_000,
					sequence: { groupOrder: 2 },
				},
			},
		],
	},
});
