import { rmSync } from 'node:fs';
import { sealedEnv } from './__tests__/sealed.mjs';
import { pageCode } from './pageCode.vite';
import { defineConfig } from 'vitest/config';

// One sealed world for the whole run (`sealed.mjs`).
const sealed = sealedEnv();
process.once('exit', () => rmSync(sealed.base, { recursive: true, force: true }));

// Real Chrome measuring real builds' accessibility: over a minute of the integration tests' three. CI runs them on
// every push, so `check` leaves them to it (and to `check:full`).
const SLOW = ['__tests__/cli.integration.spec.ts', '__tests__/buildCheck.integration.spec.ts', '__tests__/probe.integration.spec.ts'];
const integration = { maxWorkers: '50%', testTimeout: 30_000, sequence: { groupOrder: 1 } };

export default defineConfig({
	plugins: [pageCode()],
	esbuild: { jsx: 'automatic' },
	test: {
		// Every test, and every process one starts, in the sealed world: no home, token, `gh` or push of the person's.
		env: sealed.env,
		projects: [
			{
				extends: true,
				test: {
					name: 'unit',
					include: ['__tests__/**/*.spec.ts'],
					exclude: ['__tests__/**/*.integration.spec.ts', '__tests__/**/*.dom.spec.ts', '__tests__/**/*.library.spec.ts'],
				},
			},
			{ extends: true, test: { name: 'dom', include: ['__tests__/**/*.dom.spec.ts'], environment: 'jsdom' } },
			// Real git, esbuild and the real library: fewer at once and more time each, since a test waiting on a busy machine
			// has not failed. Their own group runs after the rest, so one filter can name both kinds of file (vitest refuses
			// projects that share a group but not how many run at once).
			{
				extends: true,
				test: { name: 'integration', include: ['__tests__/**/*.integration.spec.ts'], exclude: SLOW, ...integration },
			},
			{ extends: true, test: { name: 'slow', include: SLOW, ...integration } },
			// One file at a time in one worker that keeps its modules, so each library is drawn once a run (`realLibrary.ts`)
			// and no two builds share a folder at once.
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
