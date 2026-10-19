import { resolve } from 'node:path';
import type { Plugin } from 'vite';
import { CARRIED, bundlePage, kindOf, pageModuleOf } from './pageBundle.mjs';

/**
 * The page code (`src/page`) as text: `import PAGE from '../page/theme?page'` is that module bundled by esbuild into a
 * script defining `__fdPage`, since a script run inside a previewed page is run, never imported, so it has to be text.
 * `'…?script'` is the same for a script an agent runs with Node (`bundleScript`).
 */
export const pageCode = (): Plugin => ({
	name: 'dsnr-page-code',
	enforce: 'pre',
	resolveId: (source, importer) => {
		const kind = kindOf(source);
		return kind && importer ? `\0${kind}:${pageModuleOf(source, importer)}` : null;
	},
	async load(id) {
		const m = /^\0(page|script):(.*)$/.exec(id);
		if (!m) return null;
		const { text, inputs } = await CARRIED[m[1] as 'page' | 'script'](m[2] as string);
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
