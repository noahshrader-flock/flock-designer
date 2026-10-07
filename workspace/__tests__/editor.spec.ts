import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SessionMemory, findEditor, resumeCommand } from '../src/main/services/editor';

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
