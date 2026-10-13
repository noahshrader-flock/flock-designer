import { watch } from 'node:fs';
import * as vscode from 'vscode';
import { served } from '../../src/main/handle';
import type { Context } from '../../src/main/services/findContext';
import { type Panels, answerCall } from './bridge';
import { afterQuiet, whatChanged } from './devReload';
import { newNonce, panelHtml } from './html';
import { type Review, readMessage } from './messages';
import type { Given } from './newPrototype';
import { failed } from './ui';

export interface PanelDeps {
	extensionUri: vscode.Uri;
	panels: Panels;
	/** What is open now: the product, its design system, the design repository, and what is missing. */
	context: () => Context;
	locate: () => Promise<void>;
	openReview: (review: Review) => Promise<void>;
	openReviewInBrowser: (review: Review) => Promise<void>;
	/** Starts a prototype from what the panel's dialog asked. */
	startPrototype: (answers: Given) => Promise<void>;
	/** Run from its source: the panel follows its own build. */
	development: boolean;
	/** Where a run from source says what it did: View › Output › DSNR. */
	log?: vscode.LogOutputChannel;
}

/**
 * DSNR's panel in the side bar: a webview of the extension's own build, allowed to load from its `dist/` folder and
 * nowhere else. What it asks is read in exactly its shape (`readMessage`): a call is answered from the core's table, and
 * the panel's own requests (locate the design system, get started, open a review, start a prototype) are the shell's. Who is signed in is said beside
 * the DSNR mark in VS Code's own title bar (`showAccount`), where the Sign in and account actions are. Run from its
 * source, it follows its own build: a rebuilt page reloads the panel, a rebuilt extension restarts the extension host.
 */
export class PanelProvider implements vscode.WebviewViewProvider {
	private view: vscode.WebviewView | undefined;
	private login: string | undefined;

	constructor(private readonly deps: PanelDeps) {}

	/** Who is signed in, beside the DSNR mark; nothing when no one is. Kept until the panel is shown, if it is not yet. */
	showAccount(login: string | undefined): void {
		this.login = login;
		if (this.view) this.view.description = login;
	}

	private get dist(): vscode.Uri {
		return vscode.Uri.joinPath(this.deps.extensionUri, 'dist');
	}

	resolveWebviewView(view: vscode.WebviewView): void {
		view.webview.options = { enableScripts: true, localResourceRoots: [this.dist] };
		view.webview.html = this.html(view.webview);
		this.view = view;
		view.description = this.login;
		const listening = this.deps.panels.add(view.webview);
		view.onDidDispose(() => {
			listening.dispose();
			this.view = undefined;
		});
		view.webview.onDidReceiveMessage((raw: unknown) => void this.receive(view.webview, raw));
		// Hidden, the page is gone, and loads again when shown: nothing is sent to it until it says it listens.
		view.onDidChangeVisibility(() => !view.visible && this.deps.panels.unready(view.webview));
		if (this.deps.development) this.follow(view);
	}

	private async receive(webview: vscode.Webview, raw: unknown): Promise<void> {
		const message = readMessage(raw);
		if (!message) return;
		try {
			switch (message.type) {
				case 'call':
					return await answerCall(webview, served(), message);
				case 'ready':
					// Told once the page listens: a message posted before then is lost.
					await webview.postMessage({ type: 'context', context: this.deps.context() });
					// And what was held for the page until it listened (a dialog asked for while the panel was hidden).
					return this.deps.panels.ready(webview);
				case 'locate-design-system':
					return await this.deps.locate();
				case 'open-review':
					return await this.deps.openReview(message);
				case 'open-review-in-browser':
					return await this.deps.openReviewInBrowser(message);
				case 'get-started':
					return void (await vscode.commands.executeCommand('dsnr.getStarted'));
				case 'ask-new-prototype':
					return void (await vscode.commands.executeCommand('dsnr.newPrototype'));
				case 'new-prototype':
					return await this.deps.startPrototype(message);
			}
		} catch (err) {
			failed(err);
		}
	}

	/** Reloads the panel, or restarts the extension, when the build in `dist/` changes. Stops when the panel goes. */
	private follow(view: vscode.WebviewView): void {
		const reload = afterQuiet(150, () => {
			this.deps.panels.unready(view.webview);
			view.webview.html = this.html(view.webview);
			this.deps.log?.info('The page was rebuilt: the panel reloaded.');
		});
		const restart = afterQuiet(150, () => {
			this.deps.log?.info('The extension was rebuilt: restarting the extension host.');
			void vscode.commands.executeCommand('workbench.action.restartExtensionHost');
		});
		const watcher = watch(this.dist.fsPath, (_event, name) => {
			const changed = whatChanged(name === null ? null : String(name));
			if (changed === 'page') reload();
			else if (changed === 'host') restart();
		});
		view.onDidDispose(() => watcher.close());
		this.deps.log?.info(`Following the build in ${this.dist.fsPath}.`);
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
