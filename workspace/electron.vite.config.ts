import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import { resolve } from 'node:path';

export default defineConfig({
	main: {
		plugins: [externalizeDepsPlugin()],
		build: { rollupOptions: { input: resolve(__dirname, 'src/main/index.ts') } },
	},
	preload: {
		plugins: [externalizeDepsPlugin()],
		build: { rollupOptions: { input: resolve(__dirname, 'src/preload/index.ts') } },
	},
	renderer: {
		root: resolve(__dirname, 'src/renderer'),
		plugins: [react(), tailwindcss()],
		resolve: { alias: { '@': resolve(__dirname, 'src/renderer') } },
		build: {
			// React 19 ships readable source and leaves minifying to the build; React 18 shipped pre-minified,
			// which is why this was never needed before and the bundle was fine without it.
			minify: 'esbuild',
			rollupOptions: { input: resolve(__dirname, 'src/renderer/index.html') },
		},
	},
});
