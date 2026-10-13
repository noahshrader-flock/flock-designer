import { randomBytes } from 'node:crypto';

/**
 * The page DSNR's panel loads, as tight as VS Code's webview guidance asks: nothing loads unless named here, the one
 * script runs by a nonce made for this page, and styles, fonts and pictures come only from the extension's own build
 * (`cspSource`, which is VS Code's name for it), with GitHub's avatars the one picture from outside. No `vscode` import, so it is tested as plain text.
 */
export const panelHtml = ({
	cspSource,
	nonce,
	script,
	style,
	codicons,
}: {
	cspSource: string;
	nonce: string;
	script: string;
	style: string;
	codicons: string;
}): string => {
	const policy = [
		"default-src 'none'",
		`style-src ${cspSource}`,
		`font-src ${cspSource}`,
		// The person's avatar, from GitHub, and nothing else from outside.
		`img-src ${cspSource} data: https://avatars.githubusercontent.com`,
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
<body>
<div id="root"></div>
<script nonce="${nonce}" src="${script}"></script>
</body>
</html>`;
};

/** A nonce for one page: random, and new every time the page is made. */
export const newNonce = (): string => randomBytes(24).toString('base64url');
