import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tokenCss } from '../src/ui/applyTokens';

/** The base tokens the page's script sets, then the kit's, then the panel's own, as the page takes them. */
export const panelCss = (): string =>
	[tokenCss(), ...['src/ui/kit.css', 'extension/webview/styles.css'].map((file) => readFileSync(join(__dirname, '..', file), 'utf8'))].join('\n');
