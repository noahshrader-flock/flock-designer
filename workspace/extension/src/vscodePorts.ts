import type * as VsCode from 'vscode';
import type { Headless, Ports } from '../../src/core/ports';
import { claudeLink } from '../../src/core/services/agent/editor';
import { toolPorts } from '../../src/core/toolPorts';
import { isThisMachine } from '../../src/shared/thisMachine';

/** So the ports are tested without VS Code. */
export interface VsCodeApi {
	window: Pick<typeof VsCode.window, 'showOpenDialog' | 'showInformationMessage'>;
	env: Pick<typeof VsCode.env, 'openExternal' | 'clipboard'>;
	commands: Pick<typeof VsCode.commands, 'executeCommand'>;
	Uri: Pick<typeof VsCode.Uri, 'file' | 'parse'>;
	extensions: Pick<typeof VsCode.extensions, 'getExtension'>;
	workspace: Pick<typeof VsCode.workspace, 'workspaceFolders' | 'getConfiguration'>;
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

const CLAUDE_CODE = 'anthropic.claude-code';

/**
 * Claude Code's own commands, not its `vscode://` link, which always opens an editor tab. Showing its side panel makes
 * Claude Code remember that as where it keeps conversations.
 */
const SHOW_SIDEBAR = 'claude-vscode.sidebar.open';
const OPEN_CONVERSATION = 'claude-vscode.editor.open';

const editorHere = (vscode: VsCodeApi): Ports['editor'] => {
	const openFolder = async (_editor: string, folder: string) => {
		const here = (vscode.workspace.workspaceFolders ?? []).some((f) => f.uri.fsPath === folder);
		if (!here) await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(folder), { forceNewWindow: true });
	};
	const place = () => vscode.workspace.getConfiguration('claudeCode').get<string>('preferredLocation');
	/**
	 * Waited for, since the sidebar command saves `preferredLocation` a moment later without waiting, and asked at once
	 * Claude Code would still read the old place. Within a second; then it opens wherever Claude Code says.
	 */
	const keptInSidebar = async () => {
		if (place() === 'sidebar') return;
		await vscode.commands.executeCommand(SHOW_SIDEBAR);
		for (let waited = 0; place() !== 'sidebar' && waited < 1000; waited += 25) await new Promise((r) => setTimeout(r, 25));
	};
	/** The link is made first: it also checks a session. */
	const open = async (what: { session: string } | { prompt: string }) => {
		const link = claudeLink(what);
		const session = 'session' in what ? what.session : undefined;
		const prompt = 'prompt' in what ? what.prompt : undefined;
		try {
			if (vscode.workspace.getConfiguration('dsnr.claudeCode').get<string>('location', 'sidebar') === 'editor')
				await vscode.commands.executeCommand(OPEN_CONVERSATION, session, prompt);
			else {
				await keptInSidebar();
				await vscode.commands.executeCommand(OPEN_CONVERSATION, session, prompt, undefined, undefined, undefined, {
					programmatic: 'honor-preferred-location',
				});
			}
		} catch {
			await vscode.env.openExternal(vscode.Uri.parse(link));
		}
	};
	return {
		find: () => (vscode.extensions.getExtension(CLAUDE_CODE) ? 'vscode' : null),
		openFolder,
		openPrompt: async (editor, root, prompt) => {
			await openFolder(editor, root);
			await open({ prompt });
		},
		openSession: async (editor, session, then) => {
			await openFolder(editor, session.root);
			then();
			await open({ session: session.session });
		},
	};
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
	editor: editorHere(vscode),
	headless,
});
