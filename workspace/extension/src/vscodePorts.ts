import type * as VsCode from 'vscode';
import type { Headless, Ports } from '../../src/core/ports';
import { claudeLink } from '../../src/core/services/agent/editor';
import { toolPorts } from '../../src/core/toolPorts';
import { isThisMachine } from '../../src/shared/thisMachine';

/** What of VS Code the ports use, so they are tested without one. */
export interface VsCodeApi {
	window: Pick<typeof VsCode.window, 'showOpenDialog' | 'showInformationMessage'>;
	env: Pick<typeof VsCode.env, 'openExternal' | 'clipboard'>;
	commands: Pick<typeof VsCode.commands, 'executeCommand'>;
	Uri: Pick<typeof VsCode.Uri, 'file' | 'parse'>;
	extensions: Pick<typeof VsCode.extensions, 'getExtension'>;
	workspace: Pick<typeof VsCode.workspace, 'workspaceFolders' | 'getConfiguration'>;
}

/**
 * Whether DSNR opens a link in the person's browser: only a page on the web (`https:`) or one served on this machine
 * (`http:` at `isThisMachine`: DSNR's own server, and a product's dev server for Run locally). Every link DSNR opens is one
 * of those; anything else (`file:`, `command:`, another scheme a page might hand it) is refused.
 */
export const openableLink = (url: string): boolean => {
	try {
		const u = new URL(url);
		return u.protocol === 'https:' || (u.protocol === 'http:' && isThisMachine(u.hostname));
	} catch {
		return false;
	}
};

/** Opens a link in the person's browser, once it is one DSNR opens (`openableLink`); refused, in words, otherwise. */
export const openLink = async (vscode: Pick<VsCodeApi, 'env' | 'Uri'>, url: string): Promise<void> => {
	if (!openableLink(url)) throw new Error(`DSNR opens only web pages and this machine's own, not ${url.slice(0, 80)}.`);
	await vscode.env.openExternal(vscode.Uri.parse(url));
};

/** Claude Code's extension, which work is handed to. */
const CLAUDE_CODE = 'anthropic.claude-code';

/**
 * Claude Code's own commands (not its `vscode://` link, which always opens an editor tab): one shows its side panel, which
 * Claude Code then remembers as where it keeps conversations; the other opens a conversation, in the place it keeps them
 * when asked to honour it (`programmatic`).
 */
const SHOW_SIDEBAR = 'claude-vscode.sidebar.open';
const OPEN_CONVERSATION = 'claude-vscode.editor.open';

/**
 * Handing work to Claude Code, where the editor is this window: there is one when Claude Code is installed in it. A
 * folder open here is not opened again; another gets a window of its own. A conversation starts, or continues, in this
 * window's Claude Code: in its side panel, or an editor tab, as the person's setting says (`dsnr.claudeCode.location`);
 * with a Claude Code that has none of these commands, through its link, which is an editor tab.
 */
const editorHere = (vscode: VsCodeApi): Ports['editor'] => {
	const openFolder = async (_editor: string, folder: string) => {
		const here = (vscode.workspace.workspaceFolders ?? []).some((f) => f.uri.fsPath === folder);
		if (!here) await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(folder), { forceNewWindow: true });
	};
	/** Where Claude Code keeps its conversations: its own setting, which its sidebar command saves. */
	const place = () => vscode.workspace.getConfiguration('claudeCode').get<string>('preferredLocation');
	/**
	 * Claude Code keeping its conversations in its side panel: shown, when it is not already its place, and then waited for,
	 * since its sidebar command saves that setting a moment later without waiting, and asked at once it would still read
	 * the old place (an editor tab). Within a second; then it opens wherever Claude Code says.
	 */
	const keptInSidebar = async () => {
		if (place() === 'sidebar') return;
		await vscode.commands.executeCommand(SHOW_SIDEBAR);
		for (let waited = 0; place() !== 'sidebar' && waited < 1000; waited += 25) await new Promise((r) => setTimeout(r, 25));
	};
	/** The conversation, in Claude Code: a session to continue, or a prompt to start with. The link also checks a session. */
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

/**
 * VS Code's ports (`Ports`): its folder picker, its messages, its links, its clipboard, its reveal in the file manager,
 * with the tools every shell shares, except the editor, which is this window (`editorHere`); drawing and checking out
 * of sight with the `headless` browser it is given (`chromeHeadless`, ELECTRON_MIGRATION_PLAN 2B).
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
	// A notification, as everything DSNR says in VS Code is: never a box that stops the window.
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
