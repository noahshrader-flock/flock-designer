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

/**
 * A script DSNR writes for an agent to run (`src/cli/…`), bundled whole into one ES module, as text: it runs with Node
 * from wherever it is written, with nothing installed beside it. A package written for require still has it, and the page
 * code it carries is bundled as every build bundles it.
 */
export const bundleScript = async (entry) => {
	const result = await build({
		entryPoints: [entry],
		bundle: true,
		write: false,
		minify: true,
		format: 'esm',
		platform: 'node',
		target: 'node20',
		banner: { js: "import { createRequire as __dsnrRequire } from 'node:module'; const require = __dsnrRequire(import.meta.url);" },
		plugins: [pageCodeEsbuild()],
		metafile: true,
		logLevel: 'silent',
	});
	return { text: result.outputFiles[0]?.text ?? '', inputs: Object.keys(result.metafile.inputs) };
};

/** What `import X from './x?page'` or `'./x?script'` is: the module beside the importer, as a TypeScript file, bundled one of these ways. */
export const CARRIED = { page: bundlePage, script: bundleScript };
const kindOf = (source) => /\?(page|script)$/.exec(source)?.[1];

/** Where `import X from './x?page'` (or `?script`) points: the module beside the importer, as a TypeScript file. */
export const pageModuleOf = (source, importer) => `${resolve(dirname(importer), source.replace(/\?(page|script)$/, ''))}.ts`;

/** The same, for esbuild: `import X from '…?page'` (or `?script`) is that module's bundle, as text. */
export const pageCodeEsbuild = () => ({
	name: 'dsnr-page-code',
	setup(b) {
		b.onResolve({ filter: /\?(page|script)$/ }, (args) => ({ path: pageModuleOf(args.path, args.importer), namespace: `dsnr-${kindOf(args.path)}` }));
		for (const kind of ['page', 'script'])
			b.onLoad({ filter: /.*/, namespace: `dsnr-${kind}` }, async (args) => {
				const { text, inputs } = await CARRIED[kind](args.path);
				return { contents: `export default ${JSON.stringify(text)};`, loader: 'js', watchFiles: inputs.map((i) => resolve(i)) };
			});
	},
});
