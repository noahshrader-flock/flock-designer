import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { asRecord } from '../../shared/json';
import { type JsonFile, jsonFile } from './jsonFile';
import { runFile } from './process';

/**
 * Handing the agent's work to the person, in their own editor.
 *
 * Every codebase run is a Claude Code session with an ID the app chose, so the same conversation can be
 * opened in VS Code afterwards with all its context: what it read, what it decided, what it changed. The
 * latest one for each branch is remembered here, so it can be continued after the app has been closed.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface AgentSession {
	session: string;
	/** Where it ran. A session belongs to its folder: it is only found again from there. */
	root: string;
}

/** The latest agent session for each branch of each checkout. */
export class SessionMemory {
	private readonly file: JsonFile<Record<string, unknown>>;

	constructor(path: string) {
		this.file = jsonFile(path, { parse: asRecord, fallback: {} });
	}

	read(root: string, branch: string): AgentSession | null {
		const found = asRecord(this.file.read()[`${root}\n${branch}`]);
		return typeof found.session === 'string' && UUID.test(found.session) && found.root === root ? { session: found.session, root } : null;
	}

	/** Not remembering costs the "continue" later, never the run itself. */
	write(root: string, branch: string, session: string): void {
		this.file.update((all) => ({ ...all, [`${root}\n${branch}`]: { session, root } }));
	}
}

/** VS Code, when it is installed with the Claude Code extension: the one editor work is handed to. */
export const findEditor = (home: string = homedir(), exists: (p: string) => boolean = existsSync): string | null => {
	const app = ['/Applications/Visual Studio Code.app', join(home, 'Applications', 'Visual Studio Code.app')].find(exists);
	if (!app) return null;
	const extensions = join(home, '.vscode', 'extensions');
	const hasClaude = exists(extensions) && readdirSync(extensions).some((n) => n.startsWith('anthropic.claude-code-'));
	return hasClaude ? app : null;
};

const run = async (file: string, args: string[]): Promise<void> => {
	await runFile(file, args, { timeoutMs: 30_000 });
};

/** Opens a folder in VS Code: a window of its own, or the one already showing it. */
export const openFolder = (editor: string, folder: string): Promise<void> => run('/usr/bin/open', ['-a', editor, folder]);

/**
 * The Claude Code extension's own link: a conversation to continue (`session`), or a new one with its first prompt
 * (`prompt`). The extension reads both from the link's query.
 */
export const claudeLink = (open: { session: string } | { prompt: string }): string => {
	if ('session' in open && !UUID.test(open.session)) throw new Error('That is not a session.');
	return `vscode://anthropic.claude-code/open?${new URLSearchParams(open).toString()}`;
};

/**
 * Opens a conversation in VS Code's Claude Code panel. The folder first, because the extension looks a session up in
 * the window's own folder, and a new one starts there; then, once that window has had a moment to be the front one,
 * the conversation.
 */
const openConversation = async (editor: string, root: string, link: string, opened: () => void, settle: number): Promise<void> => {
	await openFolder(editor, root);
	// The folder is open, so the conversation can be had there: whatever was holding it can let go now.
	opened();
	await new Promise((r) => setTimeout(r, settle));
	await run('/usr/bin/open', [link]);
};

/** Continues a session in VS Code's Claude Code panel. */
export const openSession = (editor: string, { session, root }: AgentSession, opened: () => void = () => undefined, settle = 2500): Promise<void> =>
	openConversation(editor, root, claudeLink({ session }), opened, settle);

/** Starts a new conversation in VS Code's Claude Code panel, in `root`, with its first prompt. */
export const openPrompt = (editor: string, root: string, prompt: string, settle = 2500): Promise<void> =>
	openConversation(editor, root, claudeLink({ prompt }), () => undefined, settle);

/**
 * One word for the person's own terminal, quoted as that platform's shell reads it: a Mac's (and Linux's) takes single
 * quotes, and only when the word is not plain; Windows' takes double quotes.
 */
const quote = (s: string, platform: NodeJS.Platform): string =>
	platform === 'win32' ? `"${s.replace(/"/g, '\\"')}"` : /^[\w./-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`;

/** In `root`, run `claude` with `args` (already quoted): Windows needs `cd /d` to change drive too. */
const terminalLine = (root: string, claude: string, args: string, platform: NodeJS.Platform): string =>
	`cd ${platform === 'win32' ? '/d ' : ''}${quote(root, platform)} && ${quote(claude, platform)} ${args}`;

/** Without VS Code: a new conversation, from a terminal, in `root`, with its first prompt. */
export const startCommand = (claude: string, root: string, prompt: string, platform: NodeJS.Platform = process.platform): string =>
	terminalLine(root, claude, quote(prompt, platform), platform);

/**
 * Work handed to Claude Code in the repository `root`, its conversation starting with `prompt`: a new conversation in VS
 * Code when VS Code with Claude Code is here (`editor`), else the command that starts it in a terminal, put on the clipboard
 * (`command`). Every hand-over is this one: a prototype's build, and Build in the codebase.
 */
export const handToClaude = async (
	ports: {
		editor: { find(): string | null; openPrompt(editor: string, root: string, prompt: string): Promise<void> };
		claude(): string;
		copy(text: string): Promise<void>;
	},
	root: string,
	prompt: string,
): Promise<{ editor: boolean; command: string | null }> => {
	const editor = ports.editor.find();
	if (editor) {
		await ports.editor.openPrompt(editor, root, prompt);
		return { editor: true, command: null };
	}
	const command = startCommand(ports.claude(), root, prompt);
	await ports.copy(command);
	return { editor: false, command };
};
