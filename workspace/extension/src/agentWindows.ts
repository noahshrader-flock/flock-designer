import type { Ports } from '../../src/core/ports';
import { type Agent, type AgentId, DEFAULT_AGENT, isAgentId } from '../../src/core/services/agent/agent';
import type { Handed } from '../../src/shared/contract';
import type { VsCodeApi } from './vscodePorts';

/** Where an agent is opened in VS Code: whether this VS Code has it, and opening it in `root` with `prompt`. */
interface AgentWindow {
	here(): boolean;
	open(agent: Agent, root: string, prompt: string): Promise<NonNullable<Handed['opened']>>;
}

const CLAUDE_CODE = 'anthropic.claude-code';

/**
 * Claude Code's own commands, not its `vscode://` link, which always opens an editor tab. Showing its side panel makes
 * Claude Code remember that as where it keeps conversations.
 */
const SHOW_SIDEBAR = 'claude-vscode.sidebar.open';
const OPEN_CONVERSATION = 'claude-vscode.editor.open';

export const claudeLink = (prompt: string): string => `vscode://anthropic.claude-code/open?${new URLSearchParams({ prompt }).toString()}`;

const claudeWindow = (vscode: VsCodeApi): AgentWindow => {
	// A conversation starts in its window's own folder, so a folder that is not this window's opens in one of its own.
	const openFolder = async (folder: string) => {
		if (!(vscode.workspace.workspaceFolders ?? []).some((f) => f.uri.fsPath === folder))
			await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(folder), { forceNewWindow: true });
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
	return {
		here: () => vscode.extensions.getExtension(CLAUDE_CODE) !== undefined,
		open: async (_agent, root, prompt) => {
			await openFolder(root);
			try {
				if (vscode.workspace.getConfiguration('dsnr.agent').get<string>('location', 'sidebar') === 'editor')
					await vscode.commands.executeCommand(OPEN_CONVERSATION, undefined, prompt);
				else {
					await keptInSidebar();
					await vscode.commands.executeCommand(OPEN_CONVERSATION, undefined, prompt, undefined, undefined, undefined, {
						programmatic: 'honor-preferred-location',
					});
				}
			} catch {
				await vscode.env.openExternal(vscode.Uri.parse(claudeLink(prompt)));
			}
			return 'typed';
		},
	};
};

/** The program itself in an integrated terminal, no shell between, so the prompt is one argument and nothing is quoted. */
const terminalWindow = (vscode: VsCodeApi): AgentWindow => ({
	here: () => true,
	open: async (agent, root, prompt) => {
		vscode.window.createTerminal({ name: agent.name, cwd: root, shellPath: agent.program(), shellArgs: agent.startArgs(prompt) }).show();
		return 'started';
	},
});

/** One for each agent, so a new one cannot be added without saying what its window in VS Code is (null: it has none). */
const windowsOf = (vscode: VsCodeApi): Record<AgentId, AgentWindow | null> => ({
	'claude-code': claudeWindow(vscode),
	// Its VS Code extension's commands take no prompt and no folder.
	codex: terminalWindow(vscode),
});

/** Null when this VS Code has nowhere for the agent: it is then given a terminal command to copy. */
export const agentWindows = (vscode: VsCodeApi): Ports['agentWindow'] => {
	const windows = windowsOf(vscode);
	return {
		open: async (agent, root, prompt) => {
			const window = windows[agent.id];
			return window?.here() ? window.open(agent, root, prompt) : null;
		},
	};
};

/**
 * The person's own choice, `dsnr.agent.use`; the default until they choose. Not `dsnr.agent` itself: VS Code drops every
 * setting under a section that is also a value, `dsnr.agent.location` with it.
 */
export const agentChoice = (vscode: Pick<VsCodeApi, 'workspace'>): AgentId => {
	const chosen = vscode.workspace.getConfiguration('dsnr.agent').get<unknown>('use');
	return isAgentId(chosen) ? chosen : DEFAULT_AGENT;
};

/**
 * `dsnr.claudeCode.location` became `dsnr.agent.location`: a value set under the old name, at any level, is moved to the new
 * one and the old cleared, so it is moved, and said, once. True when anything was moved.
 */
export const moveLocationSetting = async (vscode: Pick<VsCodeApi, 'workspace' | 'ConfigurationTarget'>): Promise<boolean> => {
	const old = vscode.workspace.getConfiguration('dsnr.claudeCode');
	const now = vscode.workspace.getConfiguration('dsnr.agent');
	const set = old.inspect<string>('location');
	let moved = false;
	for (const [value, target] of [
		[set?.globalValue, vscode.ConfigurationTarget.Global],
		[set?.workspaceValue, vscode.ConfigurationTarget.Workspace],
		[set?.workspaceFolderValue, vscode.ConfigurationTarget.WorkspaceFolder],
	] as const) {
		if (value === undefined) continue;
		await now.update('location', value, target);
		await old.update('location', undefined, target);
		moved = true;
	}
	return moved;
};
