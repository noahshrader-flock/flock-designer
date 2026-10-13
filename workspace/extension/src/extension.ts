import * as vscode from 'vscode';
import { PanelProvider } from './panel';

/** DSNR, started when its panel is first shown or its command is run (VS Code infers both from the manifest). */
export const activate = (context: vscode.ExtensionContext): void => {
	// Run from its source, in Development or under VS Code's test runner; never once installed from a package.
	const development = context.extensionMode !== vscode.ExtensionMode.Production;
	const log = development ? vscode.window.createOutputChannel('DSNR', { log: true }) : undefined;
	if (log) context.subscriptions.push(log);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider('dsnr.panel', new PanelProvider(context.extensionUri, development, log)),
		// The container's own command, which VS Code makes for every one in the activity bar.
		vscode.commands.registerCommand('dsnr.open', () => vscode.commands.executeCommand('workbench.view.extension.dsnr')),
	);
};

export const deactivate = (): void => undefined;
