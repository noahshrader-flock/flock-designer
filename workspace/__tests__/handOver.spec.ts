import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Agent } from '../src/core/services/agent/agent';
import { claudeCode } from '../src/core/services/agent/claudeCode';
import { handTask } from '../src/core/services/agent/handOver';
import { startCommand } from '../src/core/services/agent/terminal';

const dirs: string[] = [];
afterEach(() => {
	for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const ready: Agent = claudeCode({
	locate: () => '/bin/claude',
	run: async () => ({ stdout: '{"loggedIn":true}', stderr: '' }),
	spawnProcess: (() => null) as never,
});

describe('a task handed over', () => {
	it('is its file, written where it is asked for, and one line saying what it is for, with the file for an agent that attaches it', async () => {
		const opened: unknown[][] = [];
		const taskFile = join(mkdtempSync(join(tmpdir(), 'dsnr-hand-')), 'demo', 'v1-build.md');
		dirs.push(join(taskFile, '..', '..'));
		const ports = { agentWindow: { open: async (...a: unknown[]) => (opened.push(a), 'typed' as const) }, copy: async () => undefined };
		await handTask(ports, ready, async () => ({ root: '/work/lib', what: 'Build prototype Version 1 of demo.', taskFile, task: '# The task' }));
		expect(readFileSync(taskFile, 'utf8')).toBe('# The task');
		expect(opened).toEqual([
			[
				ready,
				'/work/lib',
				`Build prototype Version 1 of demo. Your task is in ${taskFile}. It is complete: read all of it, then do what it says, in order.`,
				taskFile,
			],
		]);
	});
});

describe('the command that starts an agent in a terminal', () => {
	it('starts it in the repository with the prompt, quoted', () => {
		expect(startCommand('/bin/claude', '/Users/a b/flock-coke', ["Read /tmp/it's.md"], 'darwin')).toBe(
			`cd '/Users/a b/flock-coke' && /bin/claude 'Read /tmp/it'\\''s.md'`,
		);
	});

	it('quotes each of its arguments on its own, a flag left as it is', () => {
		expect(startCommand('/bin/codex', '/work', ['--no-daemon', 'Build it.'], 'darwin')).toBe(`cd /work && /bin/codex --no-daemon 'Build it.'`);
	});

	it('changes drive and folder on Windows, and quotes the Windows way', () => {
		expect(startCommand('C:\\Users\\pat\\.local\\bin\\claude.exe', 'D:\\code\\flock coke', ['Read "C:\\a b.md" now'], 'win32')).toBe(
			'cd /d "D:\\code\\flock coke" && "C:\\Users\\pat\\.local\\bin\\claude.exe" "Read \\"C:\\a b.md\\" now"',
		);
	});
});
