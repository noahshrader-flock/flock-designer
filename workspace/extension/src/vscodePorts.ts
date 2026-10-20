import type * as VsCode from 'vscode';
import type { Headless, Ports } from '../../src/core/ports';
import { toolPorts } from '../../src/core/toolPorts';
import { agentChoice, agentWindows } from './agentWindows';
import { isThisMachine } from '../../src/shared/thisMachine';

/** So the ports are tested without VS Code. */
export interface VsCodeApi {
	window: Pick<typeof VsCode.window, 'showOpenDialog' | 'showInformationMessage' | 'createTerminal'>;
	env: Pick<typeof VsCode.env, 'openExternal' | 'clipboard'>;
	commands: Pick<typeof VsCode.commands, 'executeCommand'>;
	Uri: Pick<typeof VsCode.Uri, 'file' | 'parse'>;
	extensions: Pick<typeof VsCode.extensions, 'getExtension'>;
	workspace: Pick<typeof VsCode.workspace, 'workspaceFolders' | 'getConfiguration'>;
	ConfigurationTarget: typeof VsCode.ConfigurationTarget;
}

/** Anything but `https:` or `http:` on this machine (`file:`, `command:`, another scheme a page might hand it) is refused. */
export const openableLink = (url: string): boolean => {
	try {
		const u = new URL(url);
		return u.protocol === 'https:' || (u.protocol === 'http:' && isThisMachine(u.hostname));
	} catch {
		return false;
	}
};

export const openLink = async (vscode: Pick<VsCodeApi, 'env' | 'Uri'>, url: string): Promise<void> => {
	if (!openableLink(url)) throw new Error(`DSNR opens only web pages and this machine's own, not ${url.slice(0, 80)}.`);
	await vscode.env.openExternal(vscode.Uri.parse(url));
};

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
	// Never a modal box: everything DSNR says in VS Code is a notification.
	tell: async ({ message, detail }) => {
		await vscode.window.showInformationMessage(detail ? `${message} ${detail}` : message);
	},
	openExternal: (url) => openLink(vscode, url),
	openPath: async (path) => {
		await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(path));
	},
	copy: (text) => Promise.resolve(vscode.env.clipboard.writeText(text)),
	...toolPorts(),
	agentWindow: agentWindows(vscode),
	agentChoice: () => agentChoice(vscode),
	headless,
});
