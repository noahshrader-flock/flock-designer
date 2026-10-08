import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

/**
 * The comments on a prototype's published page (src/viewer): the app's own comments experience and look, built as one
 * script and one stylesheet with fixed names, which the site copies beside every page (see buildSite).
 */
export default defineConfig({
	root: __dirname,
	publicDir: false,
	plugins: [react(), tailwindcss()],
	resolve: { alias: { '@': resolve(__dirname, 'src/renderer') } },
	logLevel: 'warn',
	build: {
		outDir: resolve(__dirname, 'out/viewer'),
		emptyOutDir: true,
		minify: 'esbuild',
		cssCodeSplit: false,
		rollupOptions: {
			input: resolve(__dirname, 'src/viewer/main.tsx'),
			output: { format: 'es', entryFileNames: 'viewer.js', assetFileNames: 'viewer[extname]', inlineDynamicImports: true },
		},
	},
});
