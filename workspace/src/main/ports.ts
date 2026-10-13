import { type BrowserWindow, clipboard, dialog, shell } from 'electron';
import type { GitHubApi } from '../host/github';

import { type AgentSession, findEditor, openFolder, openPrompt, openSession } from './services/editor';
import { locateClaude } from './services/agent';
import { ghApi } from './services/ghCli';
import type { ShareTools } from './services/share';
import { realShareTools } from './services/shareTools';

/**
 * Everything the handlers reach outside the app: the system's dialogs, other applications, the clipboard, the network,
 * the person's own command-line tools. Given to `registerIpc` whole, so a test hands it fakes and nothing real is
 * reachable by default: a test that forgot one fails to compile, rather than opening VS Code or pushing a branch.
 */
export interface Ports {
	/** The system's folder picker, over the window; null when the person cancels. */
	chooseFolder(options: { title: string; defaultPath?: string; canCreate?: boolean }): Promise<string | null>;
	/** A message the person reads and dismisses. */
	tell(message: { message: string; detail: string }): Promise<void>;
	/** A link opened in the person's browser. */
	openExternal(url: string): Promise<void>;
	/** A folder opened in Finder (or the system's file manager). */
	openPath(path: string): Promise<void>;
	copy(text: string): Promise<void>;
	/** What an address answers with, following redirects, within a few seconds; it throws when nothing answers. */
	httpStatus(url: string): Promise<number>;
	/** VS Code with Claude Code, when it is here, and how work is handed to it. */
	editor: {
		find(): string | null;
		openFolder(editor: string, folder: string): Promise<void>;
		openPrompt(editor: string, root: string, prompt: string): Promise<void>;
		openSession(editor: string, session: AgentSession, then: () => void): Promise<void>;
	};
	/** Where Claude Code is, for a command the person runs themselves. */
	claude(): string;
	/** GitHub's API as the person, through their own command line (`gh`); null when it is not here. */
	personGitHub: GitHubApi | null;
	/** The person's own git and GitHub command line, for a pull request from `root`. */
	shareTools(root: string): ShareTools;
}

export const electronPorts = (window: BrowserWindow): Ports => {
	// One for both: the person's own command line, which lists their repositories and opens their pull requests.
	const person = ghApi();
	return {
		chooseFolder: async ({ title, defaultPath, canCreate = false }) => {
			const { canceled, filePaths } = await dialog.showOpenDialog(window, {
				title,
				...(defaultPath !== undefined ? { defaultPath } : {}),
				properties: canCreate ? ['openDirectory', 'createDirectory'] : ['openDirectory'],
			});
			return canceled ? null : (filePaths[0] ?? null);
		},
		tell: async ({ message, detail }) => {
			await dialog.showMessageBox({ type: 'info', message, detail });
		},
		openExternal: (url) => shell.openExternal(url),
		openPath: async (path) => {
			await shell.openPath(path);
		},
		copy: (text) => clipboard.writeText(text),
		httpStatus: async (url) => {
			const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(6000) });
			await res.body?.cancel();
			return res.status;
		},
		editor: { find: () => findEditor(), openFolder, openPrompt, openSession },
		claude: () => locateClaude(),
		personGitHub: person,
		shareTools: (root) => realShareTools(root, person),
	};
};
