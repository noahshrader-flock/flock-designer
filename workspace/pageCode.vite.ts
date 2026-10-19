import { resolve } from 'node:path';
import type { Plugin } from 'vite';
import { CARRIED, bundlePage, kindOf, pageModuleOf } from './pageBundle.mjs';

/**
 * `'…?page'` imports the module bundled to text (a script defining `__fdPage`): a script inside a previewed page is run,
 * never imported. `'…?script'` is the same for a script an agent runs with Node.
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

export const pageAgent = (): Plugin => ({
	name: 'dsnr-page-agent',
	async generateBundle() {
		const { text } = await bundlePage(resolve(__dirname, 'src/page/agentMain.ts'));
		this.emitFile({ type: 'asset', fileName: 'page-agent.js', source: text });
	},
});
