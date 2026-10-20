import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tokenCss } from '../src/ui/applyTokens';

/** The base tokens the page's script sets, then the kit's, then the panel's own, as the page takes them. */
export const panelCss = (): string =>
	[tokenCss(), ...['src/ui/kit.css', 'extension/webview/styles.css'].map((file) => readFileSync(join(__dirname, '..', file), 'utf8'))].join('\n');

const viewerCss = readFileSync(join(__dirname, '..', 'src/viewer/viewer.css'), 'utf8').replace(/@import[^;]+;/g, '');

/** A page with the kit's and the review bar's styles around `body`, to measure in a real browser. */
export const barPage = (body: string): string =>
	`<!doctype html><html><head><meta charset="utf-8"><style>${panelCss()}\n${viewerCss}</style></head><body>${body}</body></html>`;
