import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { pageAgent, pageCode } from './pageCode.vite';
import { defineConfig } from 'vite';

export default defineConfig({
	root: __dirname,
	publicDir: false,
	// What the stylesheet names (its font) is beside it, wherever the site puts the two.
	base: './',
	plugins: [react(), pageCode(), pageAgent()],
	logLevel: 'warn',
	build: {
		outDir: resolve(__dirname, 'out/viewer'),
		emptyOutDir: true,
		minify: 'esbuild',
		cssCodeSplit: false,
		// The icon font is its own file beside the stylesheet (viewer.ttf), never written into it.
		assetsInlineLimit: 0,
		rollupOptions: {
			input: resolve(__dirname, 'src/viewer/main.tsx'),
			output: { format: 'es', entryFileNames: 'viewer.js', assetFileNames: 'viewer[extname]', inlineDynamicImports: true },
		},
	},
});
