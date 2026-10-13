import { watch } from 'node:fs';
import * as vscode from 'vscode';
import { afterQuiet, whatChanged } from './devReload';
import { newNonce, panelHtml } from './html';
import { readMessage, replyTo } from './messages';

/**
 * DSNR's panel in the side bar: a webview of the extension's own build, allowed to load from its `dist/` folder and
 * nowhere else (Phase 0.2). Run from its source (`development`), it follows its own build: a rebuilt page reloads the
 * panel, which keeps its place, and a rebuilt extension restarts the extension host (Phase 0.3).
 */
export class PanelProvider implements vscode.WebviewViewProvider {
	constructor(
		private readonly extensionUri: vscode.Uri,
		private readonly development: boolean,
		/** Where a run from source says what it did: View › Output › DSNR. */
		private readonly log?: vscode.LogOutputChannel,
	) {}

	private get dist(): vscode.Uri {
		return vscode.Uri.joinPath(this.extensionUri, 'dist');
	}

	resolveWebviewView(view: vscode.WebviewView): void {
		view.webview.options = { enableScripts: true, localResourceRoots: [this.dist] };
		view.webview.html = this.html(view.webview);
		// Only what the page may ask, in exactly its shape; anything else is dropped.
		view.webview.onDidReceiveMessage((raw: unknown) => {
			const message = readMessage(raw);
			if (message) void vscode.window.showInformationMessage(replyTo(message));
		});
		if (this.development) this.follow(view);
	}

	/** Reloads the panel, or restarts the extension, when the build in `dist/` changes. Stops when the panel goes. */
	private follow(view: vscode.WebviewView): void {
		const reload = afterQuiet(150, () => {
			view.webview.html = this.html(view.webview);
			this.log?.info('The page was rebuilt: the panel reloaded.');
		});
		const restart = afterQuiet(150, () => {
			this.log?.info('The extension was rebuilt: restarting the extension host.');
			void vscode.commands.executeCommand('workbench.action.restartExtensionHost');
		});
		const watcher = watch(this.dist.fsPath, (_event, name) => {
			const changed = whatChanged(name === null ? null : String(name));
			if (changed === 'page') reload();
			else if (changed === 'host') restart();
		});
		view.onDidDispose(() => watcher.close());
		this.log?.info(`Following the build in ${this.dist.fsPath}.`);
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
