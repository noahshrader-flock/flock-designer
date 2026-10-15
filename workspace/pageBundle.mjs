import { build } from 'esbuild';
import { dirname, resolve } from 'node:path';

/**
 * A module of the page code (`src/page`), bundled into one script, as text: what is run in, or added to, a page. One
 * definition for every build that carries page code: the app's and the viewer's (`pageCode.vite.ts`) and the extension's
 * (`extension/build.mjs`), so what runs in a page is built the same way wherever it is carried.
 */
export const bundlePage = async (entry) => {
	const result = await build({
		entryPoints: [entry],
		bundle: true,
		write: false,
		format: 'iife',
		// What the scripts call it by: `__fdPage.pick()`, and so on (`shared/pageScripts.ts`).
		globalName: '__fdPage',
		platform: 'browser',
		// The browsers a reviewer opens the published site in, and the app's own.
		target: 'es2020',
		metafile: true,
		logLevel: 'silent',
	});
	return { text: result.outputFiles[0]?.text ?? '', inputs: Object.keys(result.metafile.inputs) };
};

/** Where `import X from './x?page'` points: the module beside the importer, as a TypeScript file. */
export const pageModuleOf = (source, importer) => `${resolve(dirname(importer), source.slice(0, -'?page'.length))}.ts`;

/** The same, for esbuild: `import X from '…?page'` is that module's bundle, as text. */
export const pageCodeEsbuild = () => ({
	name: 'dsnr-page-code',
	setup(b) {
		b.onResolve({ filter: /\?page$/ }, (args) => ({ path: pageModuleOf(args.path, args.importer), namespace: 'dsnr-page' }));
		b.onLoad({ filter: /.*/, namespace: 'dsnr-page' }, async (args) => {
			const { text, inputs } = await bundlePage(args.path);
			return { contents: `export default ${JSON.stringify(text)};`, loader: 'js', watchFiles: inputs.map((i) => resolve(i)) };
		});
	},
});
