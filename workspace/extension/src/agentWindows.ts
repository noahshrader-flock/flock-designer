import type { Ports } from '../../src/core/ports';
import { type Agent, type AgentId, isAgentId } from '../../src/core/services/agent/agent';
import type { ChooseDeps, Choice } from '../../src/core/services/agent/choose';
import type { Handed } from '../../src/shared/contract';
import type { VsCodeApi } from './vscodePorts';

/** Where an agent is opened in VS Code: whether this VS Code has it, and opening it in `root` with `prompt`. */
interface AgentWindow {
	here(): boolean;
	open(agent: Agent, root: string, prompt: string): Promise<NonNullable<Handed['opened']>>;
	/** For an agent that cannot say itself whether it is signed in, what VS Code can tell. */
	signedIn?(): Promise<boolean | null>;
}

const CLAUDE_CODE = 'anthropic.claude-code';

/**
 * Claude Code's own commands, not its `vscode://` link, which always opens an editor tab. Showing its side panel makes
 * Claude Code remember that as where it keeps conversations.
 */
const SHOW_SIDEBAR = 'claude-vscode.sidebar.open';
const OPEN_CONVERSATION = 'claude-vscode.editor.open';

export const claudeLink = (prompt: string): string => `vscode://anthropic.claude-code/open?${new URLSearchParams({ prompt }).toString()}`;

/** A conversation starts in its window's own folder, so a folder that is not this window's opens in one of its own. */
const openFolder = async (vscode: VsCodeApi, folder: string): Promise<void> => {
	if (!(vscode.workspace.workspaceFolders ?? []).some((f) => f.uri.fsPath === folder))
		await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(folder), { forceNewWindow: true });
};

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
		open: async (_agent, root, prompt) => {
			await openFolder(vscode, root);
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

/** VS Code's own Chat command, which its own commands open with a query in agent mode (`isPartialQuery`: typed, not sent). */
const CHAT_OPEN = 'workbench.action.chat.open';

/** In VS Code's Chat, which has Copilot built in; in its command line, in a terminal, when this VS Code has no Chat. */
const copilotWindow = (vscode: VsCodeApi, terminal: AgentWindow): AgentWindow => ({
	here: () => true,
	// Its models are offered only to someone signed in; listing them asks nothing of the person, using one would.
	signedIn: async () => ((await vscode.lm.selectChatModels({ vendor: 'copilot' })).length > 0 ? true : null),
	open: async (agent, root, prompt) => {
		if (!(await vscode.commands.getCommands(true)).includes(CHAT_OPEN)) return terminal.open(agent, root, prompt);
		await openFolder(vscode, root);
		await vscode.commands.executeCommand(CHAT_OPEN, { query: prompt, mode: 'agent', isPartialQuery: true });
		return 'typed';
	},
});

/** One for each agent, so a new one cannot be added without saying what its window in VS Code is (null: it has none). */
const windowsOf = (vscode: VsCodeApi): Record<AgentId, AgentWindow | null> => {
	const terminal = terminalWindow(vscode);
	return {
		'claude-code': claudeWindow(vscode),
		// Its VS Code extension's commands take no prompt and no folder.
		codex: terminal,
		copilot: copilotWindow(vscode, terminal),
	};
};

/** Null when this VS Code has nowhere for the agent: it is then given a terminal command to copy. */
export const agentWindows = (vscode: VsCodeApi): Ports['agentWindow'] => {
	const windows = windowsOf(vscode);
	return {
		open: async (agent, root, prompt) => {
			const window = windows[agent.id];
			return window?.here() ? window.open(agent, root, prompt) : null;
		},
		signedIn: async (agent) => (await windows[agent.id]?.signedIn?.()) ?? null,
	};
};

/**
 * The person's own choice, `dsnr.agent.use`, or `ask` until they keep one. Not `dsnr.agent` itself: VS Code drops every
 * setting under a section that is also a value, `dsnr.agent.location` with it.
 */
export const agentChoice = (vscode: Pick<VsCodeApi, 'workspace'>): Choice => {
	const chosen = vscode.workspace.getConfiguration('dsnr.agent').get<unknown>('use');
	return isAgentId(chosen) ? chosen : 'ask';
};

/** At the person's level, so it holds in every window, and with Settings Sync on every machine. */
export const keepAgent =
	(vscode: Pick<VsCodeApi, 'workspace' | 'ConfigurationTarget'>): ChooseDeps['keep'] =>
	async (id) => {
		await vscode.workspace.getConfiguration('dsnr.agent').update('use', id, vscode.ConfigurationTarget.Global);
	};

/** VS Code's own list, so it asks wherever the work started; the pin, on until pressed, keeps the choice. */
export const pickAgent =
	(vscode: Pick<VsCodeApi, 'window' | 'ThemeIcon'>): ChooseDeps['pick'] =>
	(offered, why, kept) =>
		new Promise((done) => {
			const list = vscode.window.createQuickPick<{ id: AgentId; label: string; description: string }>();
			let keep = true;
			const pin = () => ({
				iconPath: new vscode.ThemeIcon(keep ? 'pinned' : 'pin'),
				tooltip: keep ? 'Used every time. Press to be asked each time.' : 'Asked each time. Press to use it every time.',
			});
			list.title = 'Which agent do you want to use?';
			list.placeholder = why ?? 'The task, its files and branches carry over to another agent; a conversation with one does not.';
			list.items = offered.map(({ id, name, readiness }) => ({
				id,
				label: name,
				description: [readiness.state === 'ready' ? 'signed in' : 'not sure it is signed in', ...(id === kept ? ['used now'] : [])].join(' · '),
			}));
			list.activeItems = list.items.filter((i) => i.id === kept);
			list.buttons = [pin()];
			list.onDidTriggerButton(() => {
				keep = !keep;
				list.buttons = [pin()];
			});
			list.onDidAccept(() => {
				const item = list.selectedItems[0];
				done(item ? { id: item.id, keep } : null);
				list.hide();
			});
			list.onDidHide(() => {
				done(null);
				list.dispose();
			});
			list.show();
		});

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
