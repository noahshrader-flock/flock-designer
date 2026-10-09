import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SessionMemory, claudeLink, findEditor, resumeCommand, startCommand } from '../src/main/services/editor';

const dirs: string[] = [];
const temp = () => {
	const d = mkdtempSync(join(tmpdir(), 'fdw-editor-'));
	dirs.push(d);
	return d;
};
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

const id = '5ea94a82-46ac-4823-9acb-716bcb37aa64';

describe('remembering the agent\'s conversations', () => {
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

describe('the terminal command', () => {
	it('runs from the folder the conversation belongs to, quoted', () => {
		expect(resumeCommand('/bin/claude', { session: id, root: "/Users/a b/it's" })).toBe(`cd '/Users/a b/it'\\''s' && /bin/claude --resume ${id}`);
	});
});

describe('a conversation opened in VS Code', () => {
	it('is Claude Code’s own link: a session to continue, or a new one with its first prompt', () => {
		expect(claudeLink({ session: id })).toBe(`vscode://anthropic.claude-code/open?session=${id}`);
		const link = claudeLink({ prompt: 'Build V1 · I2 into the codebase: read /tmp/a b.md & do it' });
		expect(link.startsWith('vscode://anthropic.claude-code/open?prompt=')).toBe(true);
		// Read back as the extension reads it.
		expect(new URLSearchParams(link.split('?')[1]).get('prompt')).toBe('Build V1 · I2 into the codebase: read /tmp/a b.md & do it');
	});

	it('is never made with something that is not a session', () => {
		expect(() => claudeLink({ session: 'x; rm -rf ~' })).toThrow(/not a session/);
	});
});

describe('a new conversation from a terminal', () => {
	it('starts Claude Code in the repository with the first prompt, quoted', () => {
		expect(startCommand('/bin/claude', "/Users/a b/flock-coke", "Read /tmp/it's.md")).toBe(`cd '/Users/a b/flock-coke' && /bin/claude 'Read /tmp/it'\\''s.md'`);
	});
});
