import type * as VsCode from 'vscode';
import type { Headless, Ports } from '../../src/main/ports';
import { claudeLink } from '../../src/main/services/editor';
import { toolPorts } from '../../src/main/toolPorts';

/** What of VS Code the ports use, so they are tested without one. */
export interface VsCodeApi {
	window: Pick<typeof VsCode.window, 'showOpenDialog' | 'showInformationMessage'>;
	env: Pick<typeof VsCode.env, 'openExternal' | 'clipboard'>;
	commands: Pick<typeof VsCode.commands, 'executeCommand'>;
	Uri: Pick<typeof VsCode.Uri, 'file' | 'parse'>;
	extensions: Pick<typeof VsCode.extensions, 'getExtension'>;
	workspace: Pick<typeof VsCode.workspace, 'workspaceFolders'>;
}

/** Claude Code's extension, which work is handed to. */
const CLAUDE_CODE = 'anthropic.claude-code';

/**
 * Claude Code's own command for opening a conversation, with the option that puts it where the person keeps Claude Code
 * (its side panel, or the editor), which its `vscode://` link never does: the link always opens an editor tab.
 */
const OPEN_CONVERSATION = 'claude-vscode.editor.open';

/**
 * Handing work to Claude Code, where the editor is this window: there is one when Claude Code is installed in it. A
 * folder open here is not opened again; another gets a window of its own. A conversation starts, or continues, in this
 * window's Claude Code where its person keeps it; with a Claude Code that has no such command, through its link.
 */
const editorHere = (vscode: VsCodeApi): Ports['editor'] => {
	const openFolder = async (_editor: string, folder: string) => {
		const here = (vscode.workspace.workspaceFolders ?? []).some((f) => f.uri.fsPath === folder);
		if (!here) await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(folder), { forceNewWindow: true });
	};
	/** The conversation, in Claude Code: a session to continue, or a prompt to start with. The link also checks a session. */
	const open = async (what: { session: string } | { prompt: string }) => {
		const link = claudeLink(what);
		try {
			await vscode.commands.executeCommand(
				OPEN_CONVERSATION,
				'session' in what ? what.session : undefined,
				'prompt' in what ? what.prompt : undefined,
				undefined,
				undefined,
				undefined,
				{ programmatic: 'honor-preferred-location' },
			);
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
	editor: editorHere(vscode),
	headless,
});
