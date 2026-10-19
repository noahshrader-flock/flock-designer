import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** The kit's first, then the panel's own, as the page takes them. */
export const panelCss = (): string =>
	['src/ui/kit.css', 'extension/webview/styles.css'].map((file) => readFileSync(join(__dirname, '..', file), 'utf8')).join('\n');
