import { describe, expect, it, vi } from 'vitest';
import { claudeArgv, claudeCode, locateClaude } from '../src/core/services/agent/claudeCode';
import { codex, locateCodex } from '../src/core/services/agent/codex';
import { locateCopilot } from '../src/core/services/agent/copilot';
import { runByChosen } from '../src/core/services/agent/agent';

describe('running unattended', () => {
	const argv = claudeArgv('/bin/claude', 'change it', []);

	it('prints, allows edits, and streams, since nobody is there to answer a prompt', () => {
		expect(argv).toContain('-p');
		expect(argv[argv.indexOf('--permission-mode') + 1]).toBe('acceptEdits');
		expect(argv[argv.indexOf('--output-format') + 1]).toBe('stream-json');
	});

	it("allows running the repository's scripts and local git, but nothing that pushes or discards", () => {
		const allowed = argv[argv.indexOf('--allowedTools') + 1] ?? '';
		expect(allowed).toContain('Bash(npm run:*)');
		expect(allowed).toContain('Bash(git commit:*)');
		for (const bad of ['git push', 'git reset', 'git checkout', 'rm', 'curl']) expect(allowed).not.toContain(bad);
	});

	it("turns off the attribution line Claude Code adds to its commits, so the designer's history has none", () => {
		const settings = JSON.parse(argv[argv.indexOf('--settings') + 1] ?? '{}');
		expect(settings).toEqual({ attribution: { commit: '', pr: '' } });
	});

	it('lets it read the folders given as read only and change none of them, and gives no rules when there are none', () => {
		const settingsOf = (given: string[]) => JSON.parse(given[given.indexOf('--settings') + 1] ?? '{}');
		expect(settingsOf(claudeArgv('/bin/claude', 't', ['/c/coke'])).permissions).toEqual({
			allow: ['Read(//c/coke/**)'],
			deny: ['Edit(//c/coke/**)', 'Write(//c/coke/**)'],
		});
		expect(settingsOf(claudeArgv('/bin/claude', 't', [])).permissions).toBeUndefined();
	});
});

describe('finding Claude Code', () => {
	const none = () => false;
	it('prefers whatever is on the PATH', () => {
		expect(locateClaude({ env: { PATH: '/a:/b' }, home: '/h', exists: (p) => p === '/b/claude', list: () => [] })).toBe('/b/claude');
	});

	it('finds the copy an editor bundles, newest version, when nothing is on the PATH', () => {
		const bin = (v: string) => `/h/.vscode/extensions/anthropic.claude-code-${v}/resources/native-binary/claude`;
		const found = locateClaude({
			env: { PATH: '' },
			home: '/h',
			exists: (p) => p === bin('2.1.289-darwin-arm64') || p === bin('2.1.287-darwin-arm64'),
			list: () => ['anthropic.claude-code-2.1.287-darwin-arm64', 'anthropic.claude-code-2.1.289-darwin-arm64', 'other.extension-1.0.0'],
		});
		expect(found).toBe(bin('2.1.289-darwin-arm64'));
	});

	it('finds the one its own installer put in its own place', () => {
		expect(locateClaude({ env: { PATH: '' }, home: '/h', exists: (p) => p === '/h/.claude/local/claude', list: () => [] })).toBe(
			'/h/.claude/local/claude',
		);
	});

	it('falls back to the bare name, whose failure says what to install', () => {
		expect(locateClaude({ env: { PATH: '' }, home: '/h', exists: none, list: () => [] })).toBe('claude');
	});
});

describe('finding Codex', () => {
	const extensions = '/h/.vscode/extensions';
	it('prefers whatever is on the PATH', () => {
		expect(locateCodex({ env: { PATH: '/a' }, home: '/h', exists: (p) => p === '/a/codex', list: () => [] })).toBe('/a/codex');
	});

	it('finds the one OpenAI’s extension bundles for this machine, newest version, when nothing is on the PATH', () => {
		const bin = (v: string) => `${extensions}/openai.chatgpt-${v}/bin/macos-aarch64/codex`;
		const found = locateCodex({
			env: { PATH: '' },
			home: '/h',
			exists: (p) => p === bin('26.1007.21434-darwin-arm64') || p === bin('26.0901.1-darwin-arm64'),
			list: (d) =>
				d === extensions
					? ['openai.chatgpt-26.0901.1-darwin-arm64', 'openai.chatgpt-26.1007.21434-darwin-arm64', 'openai.codex-audio-26.1007.21434']
					: ['macos-aarch64'],
		});
		expect(found).toBe(bin('26.1007.21434-darwin-arm64'));
	});

	it('finds one Homebrew installed, which VS Code started from the Dock has no PATH to', () => {
		expect(locateCodex({ env: { PATH: '' }, home: '/h', exists: (p) => p === '/opt/homebrew/bin/codex', list: () => [] })).toBe(
			'/opt/homebrew/bin/codex',
		);
	});

	it('falls back to the bare name, whose failure says what to install', () => {
		expect(locateCodex({ env: { PATH: '' }, home: '/h', exists: () => false, list: () => [] })).toBe('codex');
	});
});

describe('finding GitHub Copilot’s command line', () => {
	it('is on the PATH, or where its own installers put it: never inside the Copilot extension', () => {
		expect(locateCopilot({ env: { PATH: '/a' }, home: '/h', exists: (p) => p === '/a/copilot', list: () => [] })).toBe('/a/copilot');
		// VS Code started from the Dock has no Homebrew on its PATH.
		expect(locateCopilot({ env: { PATH: '' }, home: '/h', exists: (p) => p === '/opt/homebrew/bin/copilot', list: () => [] })).toBe(
			'/opt/homebrew/bin/copilot',
		);
		expect(locateCopilot({ env: { PATH: '' }, home: '/h', exists: () => false, list: () => ['github.copilot-chat-1.0.0'] })).toBe('copilot');
	});
});

describe('a run nobody watches, by the chosen agent', () => {
	const said = async () => ({ stdout: '', stderr: '' });
	const claude = claudeCode({ locate: () => 'claude', run: said, spawnProcess: (() => null) as never });
	const both = [claude, codex({ locate: () => 'codex', run: said })];

	it('is refused for an agent that does not run unattended, naming the ones that do', async () => {
		await expect(runByChosen(both[1]!, both, '/scratch', 'Make it 6.', { readOnly: [] })).rejects.toThrow(
			'Changing a value in words runs on its own, which Codex does not do here. Choose Claude Code for it.',
		);
	});

	it('is the chosen agent’s own run when it has one', async () => {
		const run = vi.fn(async () => ({ ok: true, said: 'Done.' }));
		expect(await runByChosen({ ...claude, runUnattended: run }, both, '/scratch', 'Make it 6.', { readOnly: ['/lib'] })).toEqual({
			ok: true,
			said: 'Done.',
		});
		expect(run).toHaveBeenCalledWith('/scratch', 'Make it 6.', { readOnly: ['/lib'] });
	});
});
