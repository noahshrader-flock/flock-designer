import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AgentRunner, claudeCodeAdapter, claudeStreamFormatter, locateClaude } from '../src/main/services/agent';
import type { RunLogLine } from '../src/shared/contract';

let root: string;
let logs: RunLogLine[];
const settle = () => new Promise((r) => setTimeout(r, 300));

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), 'fdw-agent-'));
	logs = [];
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('the task handed over', () => {
	it('names the project and points at the repository\'s own instructions', () => {
		const runner = new AgentRunner((l) => logs.push(l));
		const task = runner.taskFor('users-inactivity-signal', 'Flag users who have not signed in.');
		expect(task).toContain('Project: users-inactivity-signal');
		expect(task).toContain("this repository's own agent instructions");
		expect(task).toContain('Flag users who have not signed in.');
	});

	it('does not restate standards, which would be a second source that drifts', () => {
		const runner = new AgentRunner((l) => logs.push(l));
		const task = runner.taskFor('demo', 'do the thing');
		expect(task.split('\n').length).toBeLessThan(8);
	});
});

describe('the adapter boundary', () => {
	it('produces argv, not a shell string', () => {
		const argv = claudeCodeAdapter.argvFor('a task with ; and && in it');
		expect(argv[0]).toMatch(/claude$/);
		// The task is one argument, however it is punctuated.
		expect(argv[argv.indexOf('-p') + 1]).toBe('a task with ; and && in it');
	});

	it('can be swapped without touching the runner, so the tool is replaceable', async () => {
		const runner = new AgentRunner((l) => logs.push(l), {
			spawnProcess: spawn,
			adapter: { name: 'Echo', argvFor: (t) => ['node', '-e', `console.log(${JSON.stringify(t)})`] },
		});
		runner.start(root, 'demo', 'hello');
		await settle();
		expect(logs.map((l) => l.text).join('')).toContain('Project: demo');
	});
});

describe('status', () => {
	it('starts idle', () => {
		expect(new AgentRunner(() => {}).status()).toEqual({ state: 'idle' });
	});

	it('says the agent is unavailable rather than failing silently', async () => {
		const runner = new AgentRunner((l) => logs.push(l), {
			spawnProcess: spawn,
			adapter: { name: 'Nothing', argvFor: () => ['definitely-not-installed-xyz'] },
		});
		runner.start(root, 'demo', 'x');
		await settle();
		const status = runner.status();
		expect(status.state).toBe('unavailable');
		expect(status.state === 'unavailable' && status.detail).toMatch(/installed and on PATH/);
	});

	it('reports the exit code when the agent finishes', async () => {
		const runner = new AgentRunner((l) => logs.push(l), {
			spawnProcess: spawn,
			adapter: { name: 'Exit', argvFor: () => ['node', '-e', 'process.exit(0)'] },
		});
		runner.start(root, 'demo', 'x');
		await settle();
		expect(runner.status()).toEqual({ state: 'finished', exitCode: 0 });
	});

	it('does not start a second run over a running one', async () => {
		const runner = new AgentRunner((l) => logs.push(l), {
			spawnProcess: spawn,
			adapter: { name: 'Sleep', argvFor: () => ['node', '-e', 'setInterval(() => {}, 1000)'] },
		});
		const first = runner.start(root, 'demo', 'x');
		const second = runner.start(root, 'demo', 'y');
		expect(second).toEqual(first);
		runner.stop();
	});
});

describe('running unattended', () => {
	const argv = claudeCodeAdapter.argvFor('build it', { addDirs: ['/design/projects'] });

	it('prints, allows edits, and streams, since nobody is there to answer a prompt', () => {
		expect(argv).toContain('-p');
		expect(argv[argv.indexOf('--permission-mode') + 1]).toBe('acceptEdits');
		expect(argv[argv.indexOf('--output-format') + 1]).toBe('stream-json');
	});

	it('allows running the repository\'s scripts and local git, but nothing that pushes or discards', () => {
		const allowed = argv[argv.indexOf('--allowedTools') + 1] ?? '';
		expect(allowed).toContain('Bash(npm run:*)');
		expect(allowed).toContain('Bash(git commit:*)');
		for (const bad of ['git push', 'git reset', 'git checkout', 'rm', 'curl']) expect(allowed).not.toContain(bad);
	});

	it('turns off the attribution line Claude Code adds to its commits, so the designer\'s history has none', () => {
		const settings = JSON.parse(argv[argv.indexOf('--settings') + 1] ?? '{}');
		expect(settings).toEqual({ attribution: { commit: '', pr: '' } });
	});

	it('lets it write to the design repository, and puts that list last so it swallows nothing', () => {
		expect(argv.slice(-2)).toEqual(['--add-dir', '/design/projects']);
	});
});

describe('finding Claude Code', () => {
	const none = () => false;
	it('prefers whatever is on the PATH', () => {
		expect(locateClaude({ PATH: '/a:/b' }, '/h', (p) => p === '/b/claude', () => [])).toBe('/b/claude');
	});

	it('finds the copy an editor bundles, newest version, when nothing is on the PATH', () => {
		const bin = (v: string) => `/h/.vscode/extensions/anthropic.claude-code-${v}/resources/native-binary/claude`;
		const found = locateClaude({ PATH: '' }, '/h', (p) => p === bin('2.1.289-darwin-arm64') || p === bin('2.1.287-darwin-arm64'), () => [
			'anthropic.claude-code-2.1.287-darwin-arm64',
			'anthropic.claude-code-2.1.289-darwin-arm64',
			'other.extension-1.0.0',
		]);
		expect(found).toBe(bin('2.1.289-darwin-arm64'));
	});

	it('falls back to the bare name, whose failure says what to install', () => {
		expect(locateClaude({ PATH: '' }, '/h', none, () => [])).toBe('claude');
	});
});

describe('reading the stream', () => {
	const events = [
		{ type: 'system', subtype: 'init' },
		{ type: 'assistant', message: { content: [{ type: 'text', text: 'Reading the brief.' }, { type: 'tool_use', name: 'Write', input: { file_path: 'src/prototypes/x/index.tsx' } }] } },
		{ type: 'result', subtype: 'success', is_error: false },
	].map((e) => JSON.stringify(e));

	it('shows what it says and which file it touches, and nothing else', () => {
		const lines = claudeStreamFormatter()(`${events.join('\n')}\n`);
		expect(lines).toEqual(['Reading the brief.', '→ Write src/prototypes/x/index.tsx', 'Finished.']);
	});

	it('copes with a chunk that ends in the middle of a line', () => {
		const f = claudeStreamFormatter();
		const whole = `${events[1]}\n`;
		expect([...f(whole.slice(0, 20)), ...f(whole.slice(20))]).toEqual(['Reading the brief.', '→ Write src/prototypes/x/index.tsx']);
	});

	it('reports a failed run as stopped', () => {
		expect(claudeStreamFormatter()(`${JSON.stringify({ type: 'result', is_error: true, result: 'out of turns' })}\n`)).toEqual(['Stopped: out of turns']);
	});
});
