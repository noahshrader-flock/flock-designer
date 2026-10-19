import { randomBytes } from 'node:crypto';
import { escapeHtml } from '../../src/shared/html';
import type { DesignTab } from './messages';

/** Two origins of this machine's server: pictures from one, frames (a repository's code) from the other. */
export interface LocalAddresses {
	images: string;
	frames: string;
}

/**
 * As tight as VS Code's webview guidance asks: nothing loads but what the policy names, each local address an exact
 * origin, and the one script by a nonce. No `vscode` import, so it is tested as plain text.
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
	local: LocalAddresses;
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

/** New every time a page is made. */
export const newNonce = (): string => randomBytes(24).toString('base64url');
