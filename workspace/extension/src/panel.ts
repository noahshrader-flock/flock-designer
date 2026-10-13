import { watch } from 'node:fs';
import * as vscode from 'vscode';
import { served } from '../../src/main/handle';
import type { Context } from '../../src/main/services/findContext';
import { errorText } from '../../src/shared/result';
import { type Panels, answerCall } from './bridge';
import { afterQuiet, whatChanged } from './devReload';
import type { VsCodeGitHub } from './github';
import { newNonce, panelHtml } from './html';
import { readMessage, replyTo } from './messages';

export interface PanelDeps {
	extensionUri: vscode.Uri;
	panels: Panels;
	github: VsCodeGitHub;
	/** What is open now: the product, its design system, the design repository, and what is missing. */
	context: () => Context;
	locate: () => Promise<void>;
	openReview: (review: { projectId: string; name: string; title: string }) => Promise<void>;
	/** Run from its source: the panel follows its own build. */
	development: boolean;
	/** Where a run from source says what it did: View › Output › DSNR. */
	log?: vscode.LogOutputChannel;
}

/**
 * DSNR's panel in the side bar: a webview of the extension's own build, allowed to load from its `dist/` folder and
 * nowhere else. What it asks is read in exactly its shape (`readMessage`): a call is answered from the core's table, and
 * the panel's own requests (sign in, the account, locate the design system, open a review) are the shell's. Run from its
 * source, it follows its own build: a rebuilt page reloads the panel, a rebuilt extension restarts the extension host.
 */
export class PanelProvider implements vscode.WebviewViewProvider {
	constructor(private readonly deps: PanelDeps) {}

	private get dist(): vscode.Uri {
		return vscode.Uri.joinPath(this.deps.extensionUri, 'dist');
	}

	resolveWebviewView(view: vscode.WebviewView): void {
		view.webview.options = { enableScripts: true, localResourceRoots: [this.dist] };
		view.webview.html = this.html(view.webview);
		const listening = this.deps.panels.add(view.webview);
		view.onDidDispose(() => listening.dispose());
		view.webview.onDidReceiveMessage((raw: unknown) => void this.receive(view.webview, raw));
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
					return void (await webview.postMessage({ type: 'context', context: this.deps.context() }));
				case 'sign-in':
					return void (await this.deps.github.signIn());
				case 'account':
					return await this.account();
				case 'locate-design-system':
					return await this.deps.locate();
				case 'open-review':
					return await this.deps.openReview(message);
				case 'new-prototype':
					return void vscode.window.showInformationMessage(replyTo(message));
			}
		} catch (err) {
			void vscode.window.showErrorMessage(errorText(err, { firstLine: true }));
		}
	}

	/** The account, from its avatar: who is signed in, and Sign out, in VS Code's own quick pick. */
	private async account(): Promise<void> {
		const state = this.deps.github.state();
		if (state.state !== 'signedIn') return;
		const signOut = { label: '$(sign-out) Sign out of DSNR', description: 'VS Code keeps your GitHub account in its Accounts menu' };
		const picked = await vscode.window.showQuickPick([signOut], { placeHolder: `Signed in to GitHub as ${state.user.login}` });
		if (picked === signOut) this.deps.github.signOut();
	}

	/** Reloads the panel, or restarts the extension, when the build in `dist/` changes. Stops when the panel goes. */
	private follow(view: vscode.WebviewView): void {
		const reload = afterQuiet(150, () => {
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
