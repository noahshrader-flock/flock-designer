import type * as VsCode from 'vscode';
import type { Ports } from '../../src/main/ports';
import { toolPorts } from '../../src/main/toolPorts';

/** What of VS Code the ports use, so they are tested without one. */
export interface VsCodeApi {
	window: Pick<typeof VsCode.window, 'showOpenDialog' | 'showInformationMessage'>;
	env: Pick<typeof VsCode.env, 'openExternal' | 'clipboard'>;
	commands: Pick<typeof VsCode.commands, 'executeCommand'>;
	Uri: Pick<typeof VsCode.Uri, 'file' | 'parse'>;
}

/** What is not built in VS Code yet, said when it is reached rather than failing quietly. */
const later = (what: string) => async (): Promise<never> => {
	throw new Error(`${what} comes to DSNR in VS Code in a later update.`);
};

/**
 * VS Code's ports (`Ports`): its folder picker, its messages, its links, its clipboard, its reveal in the file manager,
 * with the tools every shell shares. Drawing out of sight is Phase 4's (a headless browser, ELECTRON_MIGRATION_PLAN 2B).
 */
export const vscodePorts = (vscode: VsCodeApi): Ports => ({
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
	headless: { measure: later('Drawing stories'), scan: later('Checking a page for accessibility'), draw: later("Drawing a prototype's picture") },
});
