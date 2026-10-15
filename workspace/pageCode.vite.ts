import { resolve } from 'node:path';
import type { Plugin } from 'vite';
import { bundlePage, pageModuleOf } from './pageBundle.mjs';

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
	resolveId: (source, importer) => (source.endsWith('?page') && importer ? `\0page:${pageModuleOf(source, importer)}` : null),
	async load(id) {
		if (!id.startsWith('\0page:')) return null;
		const { text, inputs } = await bundlePage(id.slice('\0page:'.length));
		for (const input of inputs) this.addWatchFile(resolve(input));
		return `export default ${JSON.stringify(text)};`;
	},
});

/**
 * The page agent (`src/page/agentMain.ts`; the README's Review isolation), emitted beside the viewer as `page-agent.js`: the
 * site copies it with the viewer and adds it to every prototype's page, so the bar asks the page for its pins.
 */
export const pageAgent = (): Plugin => ({
	name: 'dsnr-page-agent',
	async generateBundle() {
		const { text } = await bundlePage(resolve(__dirname, 'src/page/agentMain.ts'));
		this.emitFile({ type: 'asset', fileName: 'page-agent.js', source: text });
	},
});
