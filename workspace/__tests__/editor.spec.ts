import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SessionMemory, claudeLink, findEditor, handToClaude, startCommand } from '../src/main/services/editor';

const dirs: string[] = [];
const temp = () => {
	const d = mkdtempSync(join(tmpdir(), 'fdw-editor-'));
	dirs.push(d);
	return d;
};
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

const id = '5ea94a82-46ac-4823-9acb-716bcb37aa64';

describe("remembering the agent's conversations", () => {
	it('keeps the latest one for each branch of each checkout, across restarts', () => {
		const file = join(temp(), 'agent-sessions.json');
		new SessionMemory(file).write('/r', 'feature/a', id);
		new SessionMemory(file).write('/r', 'feature/b', 'aaaaaaaa-46ac-4823-9acb-716bcb37aa64');
		expect(new SessionMemory(file).read('/r', 'feature/a')).toEqual({ session: id, root: '/r' });
		expect(new SessionMemory(file).read('/other', 'feature/a')).toBeNull();
	});

	it('trusts nothing in the file that is not a session ID', () => {
		const file = join(temp(), 'agent-sessions.json');
		writeFileSync(file, JSON.stringify({ '/r\nfeature/a': { session: 'x; rm -rf ~', root: '/r' } }));
		expect(new SessionMemory(file).read('/r', 'feature/a')).toBeNull();
		writeFileSync(file, 'not json');
		expect(new SessionMemory(file).read('/r', 'feature/a')).toBeNull();
	});
});

describe('finding the editor', () => {
	it('is VS Code only with the Claude Code extension in it', () => {
		const home = temp();
		const app = join(home, 'Applications', 'Visual Studio Code.app');
		const has = (p: string) => p === app || p === join(home, '.vscode', 'extensions');
		expect(findEditor(home, (p) => p === app)).toBeNull();
		const ext = join(home, '.vscode', 'extensions');
		mkdirSync(join(ext, 'anthropic.claude-code-2.1.289-darwin-arm64'), { recursive: true });
		expect(findEditor(home, has)).toBe(app);
	});
});

describe('a conversation opened in VS Code', () => {
	it('is Claude Code’s own link: a session to continue, or a new one with its first prompt', () => {
		expect(claudeLink({ session: id })).toBe(`vscode://anthropic.claude-code/open?session=${id}`);
		const link = claudeLink({ prompt: 'Build V1 into the codebase: read /tmp/a b.md & do it' });
		expect(link.startsWith('vscode://anthropic.claude-code/open?prompt=')).toBe(true);
		// Read back as the extension reads it.
		expect(new URLSearchParams(link.split('?')[1]).get('prompt')).toBe('Build V1 into the codebase: read /tmp/a b.md & do it');
	});

	it('is never made with something that is not a session', () => {
		expect(() => claudeLink({ session: 'x; rm -rf ~' })).toThrow(/not a session/);
	});
});

describe('a new conversation from a terminal', () => {
	it('starts Claude Code in the repository with the first prompt, quoted', () => {
		expect(startCommand('/bin/claude', '/Users/a b/flock-coke', "Read /tmp/it's.md")).toBe(
			`cd '/Users/a b/flock-coke' && /bin/claude 'Read /tmp/it'\\''s.md'`,
		);
	});
});

describe('work handed to Claude Code, as every hand-over is', () => {
	const ports = (editor: string | null) => {
		const opened: string[][] = [];
		const copied: string[] = [];
		return {
			opened,
			copied,
			ports: {
				editor: { find: () => editor, openPrompt: async (e: string, root: string, prompt: string) => void opened.push([e, root, prompt]) },
				claude: () => '/bin/claude',
				copy: async (text: string) => void copied.push(text),
			},
		};
	};

	it('opens a new conversation in VS Code with the prompt typed in, in the repository, and copies nothing', async () => {
		const at = ports('vscode');
		expect(await handToClaude(at.ports, '/work/lib', 'Make the branch.')).toEqual({ editor: true, command: null });
		expect(at.opened).toEqual([['vscode', '/work/lib', 'Make the branch.']]);
		expect(at.copied).toEqual([]);
	});

	it('puts the command that starts it in a terminal on the clipboard when VS Code is not here', async () => {
		if (process.platform === 'win32') return;
		const at = ports(null);
		const command = `cd /work/lib && /bin/claude 'Make the branch.'`;
		expect(await handToClaude(at.ports, '/work/lib', 'Make the branch.')).toEqual({ editor: false, command });
		expect(at.copied).toEqual([command]);
		expect(at.opened).toEqual([]);
	});
});

describe('the terminal commands on Windows', () => {
	it('change drive and folder, and quote the Windows way', () => {
		expect(startCommand('C:\\Users\\pat\\.local\\bin\\claude.exe', 'D:\\code\\flock coke', 'Read "C:\\a b.md" now', 'win32')).toBe(
			'cd /d "D:\\code\\flock coke" && "C:\\Users\\pat\\.local\\bin\\claude.exe" "Read \\"C:\\a b.md\\" now"',
		);
	});
});
