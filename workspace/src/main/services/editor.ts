import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

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
	constructor(private readonly file: string) {}

	static defaultPath = (userData: string): string => join(userData, 'agent-sessions.json');

	private all(): Record<string, AgentSession> {
		try {
			const parsed = JSON.parse(readFileSync(this.file, 'utf8')) as unknown;
			return parsed && typeof parsed === 'object' ? (parsed as Record<string, AgentSession>) : {};
		} catch {
			return {};
		}
	}

	read(root: string, branch: string): AgentSession | null {
		const found = this.all()[`${root}\n${branch}`];
		return found && typeof found.session === 'string' && UUID.test(found.session) && found.root === root ? found : null;
	}

	write(root: string, branch: string, session: string): void {
		try {
			mkdirSync(dirname(this.file), { recursive: true });
			writeFileSync(this.file, JSON.stringify({ ...this.all(), [`${root}\n${branch}`]: { session, root } }));
		} catch {
			// Not remembering costs the "continue" later, never the run itself.
		}
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

const run = (file: string, args: string[]): Promise<void> =>
	new Promise((resolve, reject) => execFile(file, args, (err) => (err ? reject(err) : resolve())));

/** Opens a folder in VS Code: a window of its own, or the one already showing it. */
export const openFolder = (editor: string, folder: string): Promise<void> => run('/usr/bin/open', ['-a', editor, folder]);

/**
 * Opens a session in VS Code's Claude Code panel. The folder first, because the extension looks a session up
 * in the window's own folder; then, once that window has had a moment to be the front one, the session.
 */
export const openSession = async (editor: string, { session, root }: AgentSession, settle = 2500): Promise<void> => {
	if (!UUID.test(session)) throw new Error('That is not a session.');
	await openFolder(editor, root);
	await new Promise((r) => setTimeout(r, settle));
	await run('/usr/bin/open', [`vscode://anthropic.claude-code/open?session=${session}`]);
};

/** Without VS Code: the same conversation, from a terminal. */
export const resumeCommand = (claude: string, { session, root }: AgentSession): string => {
	const q = (s: string) => (/^[\w./-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`);
	return `cd ${q(root)} && ${q(claude)} --resume ${session}`;
};
