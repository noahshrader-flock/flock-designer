import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AgentRunner, claudeCodeAdapter } from '../src/main/services/agent';
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
		expect(argv[0]).toBe('claude');
		expect(argv).toHaveLength(2);
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
