import { rmSync } from 'node:fs';
import { sealedEnv } from './__tests__/sealed.mjs';
import { pageCode } from './pageCode.vite';
import { defineConfig } from 'vitest/config';

// One sealed world for the whole run (`sealed.mjs`), removed when it ends.
const sealed = sealedEnv();
process.once('exit', () => rmSync(sealed.base, { recursive: true, force: true }));

export default defineConfig({
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
			// Real git, esbuild and the real library: fewer at once and more time each, since a test waiting on a busy machine
			// has not failed. Their own group runs after the rest, so one filter can name both kinds of file (vitest refuses
			// projects that share a group but not how many run at once).
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
			// The real libraries on this machine (`realCheckouts.ts`), run by `check:full`: one file at a time in one worker that
			// keeps its modules, so each library is drawn once a run (`realLibrary.ts`) and no two builds share a folder at once.
			// A library's first drawing is in its block's set-up, which says how long it took.
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
