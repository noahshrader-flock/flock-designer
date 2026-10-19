import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import type { Handed } from '../../../shared/contract';
import { asRecord } from '../../../shared/json';
import { type JsonFile, jsonFile } from '../platform/jsonFile';
import { runFile } from '../platform/process';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface AgentSession {
	session: string;
	/** A session belongs to its folder: it is only found again from there. */
	root: string;
}

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

/** Null unless VS Code is installed with the Claude Code extension. */
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

export const openFolder = (editor: string, folder: string): Promise<void> => run('/usr/bin/open', ['-a', editor, folder]);

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
	opened();
	await new Promise((r) => setTimeout(r, settle));
	await run('/usr/bin/open', [link]);
};

export const openSession = (editor: string, { session, root }: AgentSession, opened: () => void = () => undefined, settle = 2500): Promise<void> =>
	openConversation(editor, root, claudeLink({ session }), opened, settle);

export const openPrompt = (editor: string, root: string, prompt: string, settle = 2500): Promise<void> =>
	openConversation(editor, root, claudeLink({ prompt }), () => undefined, settle);

const quote = (s: string, platform: NodeJS.Platform): string =>
	platform === 'win32' ? `"${s.replace(/"/g, '\\"')}"` : /^[\w./-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`;

/** `args` must be already quoted; Windows needs `cd /d` to change drive too. */
const terminalLine = (root: string, claude: string, args: string, platform: NodeJS.Platform): string =>
	`cd ${platform === 'win32' ? '/d ' : ''}${quote(root, platform)} && ${quote(claude, platform)} ${args}`;

export const startCommand = (claude: string, root: string, prompt: string, platform: NodeJS.Platform = process.platform): string =>
	terminalLine(root, claude, quote(prompt, platform), platform);

/** Without VS Code with Claude Code, the terminal command is put on the clipboard and returned as `command`. */
export const handToClaude = async (
	ports: {
		editor: { find(): string | null; openPrompt(editor: string, root: string, prompt: string): Promise<void> };
		claude(): string;
		copy(text: string): Promise<void>;
	},
	root: string,
	prompt: string,
): Promise<Handed> => {
	const editor = ports.editor.find();
	if (editor) {
		await ports.editor.openPrompt(editor, root, prompt);
		return { editor: true, command: null };
	}
	const command = startCommand(ports.claude(), root, prompt);
	await ports.copy(command);
	return { editor: false, command };
};

/** Every task is handed over as a file and one line saying what it is for, so each agent is told the same way. */
export const handTask = (
	ports: Parameters<typeof handToClaude>[0],
	root: string,
	{ what, taskFile, task }: { what: string; taskFile: string; task: string },
): Promise<Handed> => {
	mkdirSync(dirname(taskFile), { recursive: true });
	writeFileSync(taskFile, task);
	return handToClaude(ports, root, `${what} Your task is in ${taskFile}. It is complete: read all of it, then do what it says, in order.`);
};
