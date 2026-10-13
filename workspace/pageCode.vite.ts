import { build } from 'esbuild';
import { dirname, resolve } from 'node:path';
import type { Plugin } from 'vite';

/**
 * The page code (`src/page`) as one string, for the scripts the app and the published page run inside a previewed page.
 * `import PAGE from '../page/index?page'` is that module bundled by esbuild into a script that defines `__fdPage`, as
 * plain text; the app's build, the viewer's and the tests all have this plugin, so nothing is built by hand first.
 * A previewed page's script is run, never imported, so it has to be text: a bundler rewriting a function's body is
 * exactly what cannot cross into another process.
 */
export const pageCode = (): Plugin => ({
	name: 'dsnr-page-code',
	enforce: 'pre',
	resolveId: (source, importer) =>
		source.endsWith('?page') && importer ? `\0page:${resolve(dirname(importer), source.slice(0, -'?page'.length))}.ts` : null,
	async load(id) {
		if (!id.startsWith('\0page:')) return null;
		const result = await build({
			entryPoints: [id.slice('\0page:'.length)],
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
		for (const input of Object.keys(result.metafile.inputs)) this.addWatchFile(resolve(input));
		return `export default ${JSON.stringify(result.outputFiles[0]?.text ?? '')};`;
	},
});
