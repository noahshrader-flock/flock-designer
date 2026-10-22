import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * What names one agent, its programs, extensions and words, is in its adapter and nowhere else, so another agent is a new
 * adapter and not a search. A comment may name one, as this does.
 */

const workspace = join(__dirname, '..');
const ROOTS = ['src', 'extension/src', 'extension/webview', 'bin'];

/** The agents' own files: each adapter, the list of them, their windows in VS Code, and where each looks for its files. */
const HOMES = new Set([
	'src/core/services/agent/claudeCode.ts',
	'src/core/services/agent/codex.ts',
	'src/core/services/agent/copilot.ts',
	'src/core/services/agent/agent.ts',
	'src/core/services/agent/agents.ts',
	'extension/src/agentWindows.ts',
	'src/core/services/products/entryFiles.ts',
]);

const NAMES = /Claude Code|\bClaude\b|\bCodex\b|\bCopilot\b|claude-code|anthropic|openai|\bclaude\b|\bcodex\b|\bcopilot\b/;

const files = (dir: string): string[] =>
	readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		return statSync(path).isDirectory() ? files(path) : /\.(tsx?|mjs)$/.test(name) && !name.endsWith('.d.ts') ? [path] : [];
	});

const code = (text: string): string =>
	text
		.replace(/\/\*[\s\S]*?\*\//g, '')
		.replace(/^\s*\/\/.*$/gm, '')
		.replace(/\s\/\/[^'"`\n]*$/gm, '');

describe('where an agent is named', () => {
	it('finds what it looks for, and not in a comment', () => {
		expect(NAMES.test(code("const bin = 'codex';"))).toBe(true);
		expect(NAMES.test(code('// Codex answers on stderr.\nconst x = 1;'))).toBe(false);
	});

	it('is only in the agents’ own files', () => {
		const named = ROOTS.flatMap((root) => files(join(workspace, root)))
			.map((path) => relative(workspace, path))
			.filter((path) => !HOMES.has(path) && NAMES.test(code(readFileSync(join(workspace, path), 'utf8'))));
		expect(named).toEqual([]);
	});

	it('has no home that names none, so the list is exactly the agents’ files', () => {
		expect([...HOMES].filter((path) => !NAMES.test(code(readFileSync(join(workspace, path), 'utf8'))))).toEqual([]);
	});
});
