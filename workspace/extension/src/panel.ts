import { watch } from 'node:fs';
import * as vscode from 'vscode';
import { type DesignSystemAsks, type Panels, answerPage } from './bridge';
import { afterQuiet, whatChanged } from './devReload';
import { newNonce, panelHtml } from './html';
import { type CodebaseAction, type DesignTab, type HostMessage, type Review, readMessage } from './messages';
import type { Given } from './newPrototype';
import { failed } from './ui';

/**
 * A DSNR page in `webview`: the panel, or a design system's tab (`tab`), from the extension's own build in `dist`,
 * framing and showing pictures from this machine's server (`local`) alone.
 */
export const dsnrPage = (webview: vscode.Webview, dist: vscode.Uri, local: string, tab?: DesignTab): string => {
	const asset = (name: string) => webview.asWebviewUri(vscode.Uri.joinPath(dist, name)).toString();
	return panelHtml({
		cspSource: webview.cspSource,
		nonce: newNonce(),
		script: asset('webview.js'),
		style: asset('webview.css'),
		codicons: asset('codicon.css'),
		local,
		...(tab ? { tab } : {}),
	});
};

interface PanelDeps {
	extensionUri: vscode.Uri;
	panels: Panels;
	/** This machine's server's origin, which the page frames stories from and shows pictures from. */
	local: () => Promise<string>;
	/** The design system's asks, made once the core is: the page asks them only once it is shown. */
	design: () => DesignSystemAsks;
	/** What is open now (the product, its design system, the design repository, and what is missing), as the page is told it. */
	context: () => Extract<HostMessage, { type: 'context' }>;
	locate: () => Promise<void>;
	openReview: (review: Review) => Promise<void>;
	openReviewInBrowser: (review: Review) => Promise<void>;
	/** Does what the panel asked of a project's codebase work: its preview, Handoff, Share, or the work on GitHub. */
	codebase: (action: CodebaseAction, projectId: string) => Promise<void>;
	/** Starts a prototype from what the panel's dialog asked. */
	startPrototype: (answers: Given) => Promise<void>;
	/** Run from its source: the panel follows its own build. */
	development: boolean;
	/** Where a run from source says what it did: View › Output › DSNR. */
	log?: vscode.LogOutputChannel;
}

/**
 * DSNR's panel in the side bar: a webview of the extension's own build, allowed to load from its `dist/` folder and
 * nowhere else. What it asks is read in exactly its shape (`readMessage`): a call is answered from the core's table, the
 * design system's asks as any DSNR page's are (`answerPage`), and the panel's own (locate the design system, get started,
 * a review in a tab or the browser, New prototype and starting one, a project's codebase work) are the shell's. Who is
 * signed in is said beside the DSNR mark in VS Code's own title bar (`showAccount`), where Sign in and the account are. Run from its
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
		void this.load(view.webview).catch(failed);
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
			if (await answerPage(webview, message, this.deps.design())) return;
			switch (message.type) {
				case 'ready':
					// Told once the page listens: a message posted before then is lost. And the change to the tokens being tried.
					await webview.postMessage(this.deps.context());
					await webview.postMessage({ type: 'token-edits', edits: this.deps.design().edits() } satisfies HostMessage);
					// And what was held for the page until it listened (a dialog asked for while the panel was hidden).
					return this.deps.panels.ready(webview);
				case 'locate-design-system':
					return await this.deps.locate();
				case 'open-review':
					return await this.deps.openReview(message);
				case 'open-review-in-browser':
					return await this.deps.openReviewInBrowser(message);
				case 'codebase':
					return await this.deps.codebase(message.action, message.projectId);
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
			void this.load(view.webview).catch(failed);
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

	/** The page, once this machine's server says where it is. */
	private async load(webview: vscode.Webview): Promise<void> {
		webview.html = dsnrPage(webview, this.dist, await this.deps.local());
	}
}
