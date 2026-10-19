import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { claudeLink } from '../extension/src/vscodePorts';
import { type Agent, claudeCode } from '../src/core/services/agent/agent';
import { handTask } from '../src/core/services/agent/handOver';
import { startCommand } from '../src/core/services/agent/terminal';

const dirs: string[] = [];
afterEach(() => {
	for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const ready: Agent = claudeCode({ locate: () => '/bin/claude', run: async () => '{"loggedIn":true}', spawnProcess: (() => null) as never });

describe('a task handed over', () => {
	it('is its file, written where it is asked for, and one line saying what it is for', async () => {
		const opened: unknown[][] = [];
		const taskFile = join(mkdtempSync(join(tmpdir(), 'dsnr-hand-')), 'demo', 'v1-build.md');
		dirs.push(join(taskFile, '..', '..'));
		const ports = { agentWindow: { open: async (...a: unknown[]) => (opened.push(a), true) }, copy: async () => undefined };
		await handTask(ports, ready, async () => ({ root: '/work/lib', what: 'Build prototype Version 1 of demo.', taskFile, task: '# The task' }));
		expect(readFileSync(taskFile, 'utf8')).toBe('# The task');
		expect(opened).toEqual([
			[
				'claude-code',
				'/work/lib',
				`Build prototype Version 1 of demo. Your task is in ${taskFile}. It is complete: read all of it, then do what it says, in order.`,
			],
		]);
	});
});

describe('Claude Code’s link, when its own command will not open', () => {
	it('carries the prompt, whatever it holds', () => {
		const link = claudeLink('Build Version 1 into the codebase: read /tmp/a b.md & do it');
		expect(link.startsWith('vscode://anthropic.claude-code/open?prompt=')).toBe(true);
		expect(new URLSearchParams(link.split('?')[1]).get('prompt')).toBe('Build Version 1 into the codebase: read /tmp/a b.md & do it');
	});
});

describe('the command that starts an agent in a terminal', () => {
	it('starts it in the repository with the prompt, quoted', () => {
		expect(startCommand('/bin/claude', '/Users/a b/flock-coke', "Read /tmp/it's.md", 'darwin')).toBe(
			`cd '/Users/a b/flock-coke' && /bin/claude 'Read /tmp/it'\\''s.md'`,
		);
	});

	it('changes drive and folder on Windows, and quotes the Windows way', () => {
		expect(startCommand('C:\\Users\\pat\\.local\\bin\\claude.exe', 'D:\\code\\flock coke', 'Read "C:\\a b.md" now', 'win32')).toBe(
			'cd /d "D:\\code\\flock coke" && "C:\\Users\\pat\\.local\\bin\\claude.exe" "Read \\"C:\\a b.md\\" now"',
		);
	});
});
