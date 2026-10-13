import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type * as VsCode from 'vscode';
import type { PrototypeServer } from '../../src/main/services/prototypeServer';
import { DESIGN_REPO } from '../../src/shared/config';
import { parsePrototypeName } from '../../src/shared/prototypeNames';
import { buildSite } from '../../src/site/buildSite';
import { newNonce } from './html';

/** Where a prototype's review is on the site, as the site lays it out: `<project>/v<version>/i<iteration>/`. */
export const reviewPath = (projectId: string, name: string): string => {
	const parsed = parsePrototypeName(name);
	if (!parsed) throw new Error(`${name} is not a prototype, so it has no review page.`);
	return `${projectId}/v${parsed.version}/i${parsed.iteration}/`;
};

/**
 * A prototype's review in VS Code (ELECTRON_MIGRATION_PLAN 2A): its page on the site, with its own review bar (versions,
 * its states, comments), built from the design repository on this machine with the viewer the extension carries, served
 * from this machine, and framed in an editor tab. Built again each time one is opened, so it is the records as they are.
 */
export class Reviews {
	constructor(
		private readonly vscode: { window: Pick<typeof VsCode.window, 'createWebviewPanel'>; ViewColumn: typeof VsCode.ViewColumn },
		private readonly server: PrototypeServer,
		/** Where the site is built: the extension's own storage. */
		private readonly siteDir: string,
		/** The viewer the extension carries (`dist/viewer`). */
		private readonly viewerDir: string,
	) {}

	async open({ records, projectId, name, title }: { records: string; projectId: string; name: string; title: string }): Promise<void> {
		const path = reviewPath(projectId, name);
		mkdirSync(dirname(this.siteDir), { recursive: true });
		buildSite({ designRoot: dirname(records), outDir: this.siteDir, comments: undefined, viewer: { dir: this.viewerDir, ref: DESIGN_REPO } });
		const base = await this.server.serveFolder('review', this.siteDir);
		const origin = new URL(base).origin;
		const panel = this.vscode.window.createWebviewPanel('dsnr.review', title, this.vscode.ViewColumn.Active, { enableScripts: true });
		const nonce = newNonce();
		// Only the page itself, from this machine: nothing else loads in the tab.
		panel.webview.html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src ${origin}; style-src 'nonce-${nonce}'">
<style nonce="${nonce}">html, body, iframe { margin: 0; padding: 0; border: 0; width: 100%; height: 100vh; display: block; }</style>
<title>${title}</title>
</head>
<body><iframe src="${base}${path}" title="${title}"></iframe></body>
</html>`;
	}
}

/** Where the extension keeps the site it builds for reviews. */
export const siteIn = (storage: string): string => join(storage, 'review-site');
