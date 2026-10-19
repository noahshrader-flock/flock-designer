import { build } from 'esbuild';
import { dirname, resolve } from 'node:path';

/** The one definition every build that carries page code uses, so what runs in a page is built the same way everywhere. */
export const bundlePage = async (entry) => {
	const result = await build({
		entryPoints: [entry],
		bundle: true,
		write: false,
		format: 'iife',
		// What the scripts call it by (`__tests__/pageScripts.ts`).
		globalName: '__fdPage',
		platform: 'browser',
		// The browsers a reviewer opens the published site in.
		target: 'es2020',
		metafile: true,
		logLevel: 'silent',
	});
	return { text: result.outputFiles[0]?.text ?? '', inputs: Object.keys(result.metafile.inputs) };
};

/** So a package written for `require` still has it inside an ES module bundle. */
export const REQUIRE_BANNER = "import { createRequire as __dsnrRequire } from 'node:module'; const require = __dsnrRequire(import.meta.url);";

/** Bundled whole: it runs with Node from wherever it is written, with nothing installed beside it. */
export const bundleScript = async (entry) => {
	const result = await build({
		entryPoints: [entry],
		bundle: true,
		write: false,
		minify: true,
		format: 'esm',
		platform: 'node',
		target: 'node20',
		banner: { js: REQUIRE_BANNER },
		plugins: [pageCodeEsbuild()],
		metafile: true,
		logLevel: 'silent',
	});
	return { text: result.outputFiles[0]?.text ?? '', inputs: Object.keys(result.metafile.inputs) };
};

export const CARRIED = { page: bundlePage, script: bundleScript };
export const kindOf = (source) => /\?(page|script)$/.exec(source)?.[1];

export const pageModuleOf = (source, importer) => `${resolve(dirname(importer), source.replace(/\?(page|script)$/, ''))}.ts`;

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
