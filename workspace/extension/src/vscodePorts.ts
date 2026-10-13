import type * as VsCode from 'vscode';
import type { Headless, Ports } from '../../src/main/ports';
import { toolPorts } from '../../src/main/toolPorts';

/** What of VS Code the ports use, so they are tested without one. */
export interface VsCodeApi {
	window: Pick<typeof VsCode.window, 'showOpenDialog' | 'showInformationMessage'>;
	env: Pick<typeof VsCode.env, 'openExternal' | 'clipboard'>;
	commands: Pick<typeof VsCode.commands, 'executeCommand'>;
	Uri: Pick<typeof VsCode.Uri, 'file' | 'parse'>;
}

/**
 * VS Code's ports (`Ports`): its folder picker, its messages, its links, its clipboard, its reveal in the file manager,
 * with the tools every shell shares; drawing and checking out of sight with the `headless` browser it is given
 * (`chromeHeadless`, ELECTRON_MIGRATION_PLAN 2B).
 */
export const vscodePorts = (vscode: VsCodeApi, headless: Headless): Ports => ({
	chooseFolder: async ({ title, defaultPath }) =>
		(
			await vscode.window.showOpenDialog({
				title,
				canSelectFolders: true,
				canSelectFiles: false,
				canSelectMany: false,
				...(defaultPath !== undefined ? { defaultUri: vscode.Uri.file(defaultPath) } : {}),
			})
		)?.[0]?.fsPath ?? null,
	tell: async ({ message, detail }) => {
		await vscode.window.showInformationMessage(message, { modal: true, detail });
	},
	openExternal: async (url) => {
		await vscode.env.openExternal(vscode.Uri.parse(url));
	},
	openPath: async (path) => {
		await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(path));
	},
	copy: (text) => Promise.resolve(vscode.env.clipboard.writeText(text)),
	...toolPorts(),
	headless,
});
