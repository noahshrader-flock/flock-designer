import { watch } from 'node:fs';
import * as vscode from 'vscode';
import type { Route } from '../../src/core/handle';
import { type Panels, receivePage } from './bridge';
import { afterQuiet, whatChanged } from './devReload';
import { type LocalAddresses, newNonce, panelHtml } from './html';
import type { AskName, DesignTab } from './messages';
import { failed } from './ui';

/**
 * A DSNR page in `webview`: the panel, or a design system's tab (`tab`), from the extension's own build in `dist`,
 * framing and showing pictures from this machine's server (`local`) alone.
 */
export const dsnrPage = (webview: vscode.Webview, dist: vscode.Uri, local: LocalAddresses, tab?: DesignTab): string => {
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
	local: () => Promise<LocalAddresses>;
	/** The extension's asks, which the panel makes as every page does (`receivePage`). */
	asks: () => ReadonlyMap<AskName, Route>;
	development: boolean;
	log?: vscode.LogOutputChannel;
}

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
		// Kept while hidden, so it listens until VS Code throws it away: never taken for gone because it is out of sight.
		this.deps.panels.attach(view);
		view.onDidDispose(() => {
			this.view = undefined;
		});
		view.webview.onDidReceiveMessage((raw: unknown) => void receivePage(this.deps.panels, view.webview, raw, this.deps.asks(), failed));
		if (this.deps.development) this.follow(view);
	}

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
