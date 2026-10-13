import * as vscode from 'vscode';
import { newNonce, panelHtml } from './html';

/**
 * DSGN's panel in the side bar: a webview of the extension's own build, allowed to load from its `dist/` folder and
 * nowhere else (Phase 0.2).
 */
export class PanelProvider implements vscode.WebviewViewProvider {
	constructor(private readonly extensionUri: vscode.Uri) {}

	private get dist(): vscode.Uri {
		return vscode.Uri.joinPath(this.extensionUri, 'dist');
	}

	resolveWebviewView(view: vscode.WebviewView): void {
		view.webview.options = { enableScripts: true, localResourceRoots: [this.dist] };
		view.webview.html = this.html(view.webview);
	}

	private html(webview: vscode.Webview): string {
		const asset = (name: string) => webview.asWebviewUri(vscode.Uri.joinPath(this.dist, name)).toString();
		return panelHtml({
			cspSource: webview.cspSource,
			nonce: newNonce(),
			script: asset('webview.js'),
			style: asset('webview.css'),
			codicons: asset('codicon.css'),
		});
	}
}
