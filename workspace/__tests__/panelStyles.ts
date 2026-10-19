import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** The stylesheet a DSNR page is drawn with, as the page takes it: the kit's first, then the panel's own. */
export const panelCss = (): string =>
	['src/ui/kit.css', 'extension/webview/styles.css'].map((file) => readFileSync(join(__dirname, '..', file), 'utf8')).join('\n');
