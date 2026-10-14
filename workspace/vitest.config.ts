import { fileURLToPath } from 'node:url';
import { alias } from './alias.config';
import { pageCode } from './pageCode.vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	// The same `@/` alias the renderer build uses, so a component can be imported by a test as it is by the app.
	resolve: { alias },
	// The page code as the builds have it: the scripts run in a page are its bundle (`pageCode.vite.ts`).
	plugins: [pageCode()],
	// React's own JSX transform for every file, the page's viewer (src/viewer) included, as the builds use.
	esbuild: { jsx: 'automatic' },
	test: {
		// Git as every test sees it, the processes they start included: this file instead of the person's own configuration,
		// and no system one, so commits are made as a test identity and unsigned wherever it runs.
		env: { GIT_CONFIG_GLOBAL: fileURLToPath(new URL('./__tests__/gitconfig', import.meta.url)), GIT_CONFIG_NOSYSTEM: '1' },
		projects: [
			// Code alone: no process is started, so these are fast and run side by side.
			{
				extends: true,
				test: { name: 'unit', include: ['__tests__/**/*.spec.ts'], exclude: ['__tests__/**/*.integration.spec.ts', '__tests__/**/*.dom.spec.ts'] },
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
		],
	},
});
