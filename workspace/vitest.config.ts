import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	// The same `@/` alias the renderer build uses, so a component can be imported by a test as it is by the app.
	resolve: { alias: { '@': resolve(__dirname, 'src/renderer') } },
	// React's own JSX transform for every file, the page's viewer (src/viewer) included, as the builds use.
	esbuild: { jsx: 'automatic' },
	test: {
		projects: [
			// Code alone: no process is started, so these are fast and run side by side.
			{ extends: true, test: { name: 'unit', include: ['__tests__/**/*.spec.ts'], exclude: ['__tests__/**/*.integration.spec.ts'] } },
			// Real git, esbuild and the real library. Fewer at once and more time each: they share one machine's disk and
			// processor, and a test that waits on a busy machine is not a test that failed.
			{ extends: true, test: { name: 'integration', include: ['__tests__/**/*.integration.spec.ts'], maxWorkers: '50%', testTimeout: 30_000 } },
		],
	},
});
