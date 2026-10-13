import * as vscode from 'vscode';
import { PanelProvider } from './panel';

/** DSGN, started when its panel is first shown or its command is run (VS Code infers both from the manifest). */
export const activate = (context: vscode.ExtensionContext): void => {
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider('dsgn.panel', new PanelProvider(context.extensionUri)),
		// The container's own command, which VS Code makes for every one in the activity bar.
		vscode.commands.registerCommand('dsgn.open', () => vscode.commands.executeCommand('workbench.view.extension.dsgn')),
	);
};

export const deactivate = (): void => undefined;
