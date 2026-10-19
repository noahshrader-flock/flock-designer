import type { Ports } from '../../src/core/ports';
import type { AgentId } from '../../src/core/services/agent/agent';
import type { VsCodeApi } from './vscodePorts';

/** An agent's own window in VS Code: whether this VS Code has it, and opening it with a prompt typed in. */
interface AgentWindow {
	here(): boolean;
	open(prompt: string): Promise<void>;
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
		open: async (prompt) => {
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
		},
	};
};

/** One for each agent, so a new one cannot be added without saying what its window in VS Code is (null: it has none). */
const windowsOf = (vscode: VsCodeApi): Record<AgentId, AgentWindow | null> => ({ 'claude-code': claudeWindow(vscode) });

/** False when this VS Code has no window for the agent: it is then given a terminal command. */
export const agentWindows = (vscode: VsCodeApi): Ports['agentWindow'] => {
	const windows = windowsOf(vscode);
	return {
		open: async (agent, root, prompt) => {
			const window = windows[agent];
			if (!window?.here()) return false;
			// A conversation starts in its window's own folder, so a folder that is not this window's opens in one of its own.
			if (!(vscode.workspace.workspaceFolders ?? []).some((f) => f.uri.fsPath === root))
				await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(root), { forceNewWindow: true });
			await window.open(prompt);
			return true;
		},
	};
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
