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
/** A module of the page code (`src/page`), bundled into one script, as text: what is run in, or added to, a page. */
const bundlePage = async (entry: string) => {
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

export const pageCode = (): Plugin => ({
	name: 'dsnr-page-code',
	enforce: 'pre',
	resolveId: (source, importer) =>
		source.endsWith('?page') && importer ? `\0page:${resolve(dirname(importer), source.slice(0, -'?page'.length))}.ts` : null,
	async load(id) {
		if (!id.startsWith('\0page:')) return null;
		const { text, inputs } = await bundlePage(id.slice('\0page:'.length));
		for (const input of inputs) this.addWatchFile(resolve(input));
		return `export default ${JSON.stringify(text)};`;
	},
});

/**
 * The page agent (`src/page/agentMain.ts`, REVIEW_ISOLATION_PLAN 1.2), emitted beside the viewer as `page-agent.js`: the
 * site copies it with the viewer and adds it to every prototype's page, so the bar asks the page for its pins.
 */
export const pageAgent = (): Plugin => ({
	name: 'dsnr-page-agent',
	async generateBundle() {
		const { text } = await bundlePage(resolve(__dirname, 'src/page/agentMain.ts'));
		this.emitFile({ type: 'asset', fileName: 'page-agent.js', source: text });
	},
});
