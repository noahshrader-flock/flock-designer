import { randomBytes } from 'node:crypto';
import { escapeHtml } from '../../src/shared/html';
import type { DesignTab } from './messages';

/**
 * The page DSNR's panel loads, as tight as VS Code's webview guidance asks: nothing loads unless named here, the one
 * script runs by a nonce made for this page, and styles, fonts and pictures come only from the extension's own build
 * (`cspSource`, which is VS Code's name for it), the design system's stories framed from this machine's pages' address
 * and its pictures from the server's own (`local`, each an exact origin), and nowhere else. The same page is the panel or a design system's tab (`tab`), which
 * it reads from its body. No `vscode` import, so it is tested as plain text.
 */
export const panelHtml = ({
	cspSource,
	nonce,
	script,
	style,
	codicons,
	local,
	tab,
}: {
	cspSource: string;
	nonce: string;
	script: string;
	style: string;
	codicons: string;
	/** This machine's server's two addresses: pictures from its own, frames (a library's code) from the pages'. */
	local: { images: string; frames: string };
	tab?: DesignTab;
}): string => {
	const policy = [
		"default-src 'none'",
		`style-src ${cspSource}`,
		`font-src ${cspSource}`,
		`img-src ${cspSource} data: ${local.images}`,
		`frame-src ${local.frames}`,
		`script-src 'nonce-${nonce}'`,
	].join('; ');
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${policy}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="${codicons}">
<link rel="stylesheet" href="${style}">
<title>DSNR</title>
</head>
<body${tab ? ` data-tab="${escapeHtml(JSON.stringify(tab))}"` : ''}>
<div id="root"></div>
<script nonce="${nonce}" src="${script}"></script>
</body>
</html>`;
};

/** A nonce for one page: random, and new every time the page is made. */
export const newNonce = (): string => randomBytes(24).toString('base64url');
