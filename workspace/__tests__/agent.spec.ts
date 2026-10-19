import { describe, expect, it } from 'vitest';
import { claudeArgv, locateClaude } from '../src/core/services/agent/agent';

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
		expect(
			locateClaude(
				{ PATH: '/a:/b' },
				'/h',
				(p) => p === '/b/claude',
				() => [],
			),
		).toBe('/b/claude');
	});

	it('finds the copy an editor bundles, newest version, when nothing is on the PATH', () => {
		const bin = (v: string) => `/h/.vscode/extensions/anthropic.claude-code-${v}/resources/native-binary/claude`;
		const found = locateClaude(
			{ PATH: '' },
			'/h',
			(p) => p === bin('2.1.289-darwin-arm64') || p === bin('2.1.287-darwin-arm64'),
			() => ['anthropic.claude-code-2.1.287-darwin-arm64', 'anthropic.claude-code-2.1.289-darwin-arm64', 'other.extension-1.0.0'],
		);
		expect(found).toBe(bin('2.1.289-darwin-arm64'));
	});

	it('falls back to the bare name, whose failure says what to install', () => {
		expect(locateClaude({ PATH: '' }, '/h', none, () => [])).toBe('claude');
	});
});
