import { spawn } from 'node:child_process';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import type { Agent } from '../src/core/services/agent/agent';
import { claudeCode } from '../src/core/services/agent/claudeCode';
import { codex } from '../src/core/services/agent/codex';
import { startCommand } from '../src/core/services/agent/terminal';
import { handOver } from '../src/core/services/agent/handOver';

/**
 * What any agent behind the seam must do, run against a stand-in program for each that answers as that agent does. A
 * new adapter is a new row here, with its own stand-in; the checks are the same.
 */

const dir = mkdtempSync(join(tmpdir(), 'dsnr-agents-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

/** A stand-in program: told by its task what to do, so one file plays each way a run can end. */
const program = (name: string, body: string): string => {
	const file = join(dir, name);
	writeFileSync(file, `#!/usr/bin/env node\n${body}\n`);
	chmodSync(file, 0o755);
	return file;
};

type Answer = string | Error;
interface Row {
	name: string;
	/** `answer`: what its status command prints, or how it fails. */
	make: (bin: string, answer: () => Promise<Answer>) => Agent;
	answers: { ready: string; signedOut: string; unreadable: string };
	/** The stream its status command answers on, as the real one does: an adapter that reads the other hears nothing. */
	answersOn: 'stdout' | 'stderr';
	/** For an agent that runs unattended: prints as it does, the task saying how the run ends (`changed`, `refused`, `crashed`). */
	stream?: string;
}

/** What a status command printed, on the stream that agent uses; an error, as the command failing. */
const answering = (answer: () => Promise<Answer>, on: Row['answersOn']) => async () => {
	const a = await answer();
	if (a instanceof Error) throw a;
	return on === 'stdout' ? { stdout: a, stderr: '' } : { stdout: '', stderr: a };
};

const ROWS: Row[] = [
	{
		name: 'Claude Code',
		make: (bin, answer) => claudeCode({ locate: () => bin, run: answering(answer, 'stdout'), spawnProcess: spawn }),
		answersOn: 'stdout',
		answers: { ready: '{"loggedIn":true}', signedOut: '{"loggedIn":false}', unreadable: 'Logged in as someone' },
		stream: `const task = process.argv[process.argv.indexOf('-p') + 1];
const say = (e) => process.stdout.write(JSON.stringify(e) + '\\n');
say({ type: 'assistant', message: { content: [{ type: 'text', text: 'Looking.' }] } });
if (task === 'crashed') { process.stderr.write('It broke on line 2.'); process.exit(2); }
say({ type: 'result', is_error: task === 'refused', result: task === 'refused' ? 'That is not a value.' : 'Changed the radius.' });`,
	},
	{
		name: 'Codex',
		make: (bin, answer) => codex({ locate: () => bin, run: answering(answer, 'stderr') }),
		answersOn: 'stderr',
		// As `codex login status` prints them, on stderr; "Not logged in" comes with exit 1, which is still an answer.
		answers: { ready: 'Logged in using ChatGPT', signedOut: 'Not logged in', unreadable: 'Welcome to Codex' },
	},
];

/** Handed `Go.` in `/work`; `prepare` counts what would have been made for it. */
const hand = (ports: Parameters<typeof handOver>[0], a: Agent, prepare = vi.fn(async () => ({ root: '/work', prompt: 'Go.' }))) =>
	handOver(ports, a, prepare).then((r) => r.handed);

const missing = (): Error => Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' });

describe.each(ROWS)('$name, behind the seam', (row) => {
	const bin = program(`${row.name.replace(/\W/g, '')}-stand-in`, row.stream ?? 'process.exit(0);');
	const agent = (answer: Answer = row.answers.ready) => row.make(bin, async () => answer);

	it('says whether it is ready from what it says of itself, and never stands in the way when it cannot tell', async () => {
		expect(await agent(row.answers.ready).readiness()).toEqual({ state: 'ready' });
		expect(await agent(row.answers.signedOut).readiness()).toEqual({ state: 'signedOut' });
		expect(await agent(missing()).readiness()).toEqual({ state: 'missing' });
		expect(await agent(row.answers.unreadable).readiness()).toEqual({ state: 'unknown' });
		expect(await agent(new Error('timed out')).readiness()).toEqual({ state: 'unknown' });
	});

	it('names itself, and says in its own words what to do when it is missing or signed out', () => {
		const a = agent();
		expect(a.name).toBe(row.name);
		expect(a.notReady.missing).toContain(row.name);
		expect(a.notReady.signedOut).toContain(row.name);
	});

	it('starts as its own program, with the prompt whole as its last argument, so a terminal can start it in any folder', () => {
		const a = agent();
		expect(a.program()).toBe(bin);
		expect(a.startArgs('Build it, "now".').at(-1)).toBe('Build it, "now".');
		if (process.platform !== 'win32')
			expect(startCommand(a.program(), '/work/my lib', a.startArgs('Go.'))).toMatch(new RegExp(`^cd '/work/my lib' && ${bin} .*Go\\.'?$`));
	});

	it('is handed work in its own window when the editor has one, and given as a terminal command when not', async () => {
		const copied: string[] = [];
		const opened: unknown[][] = [];
		const ports = (how: 'typed' | 'started' | null) => ({
			agentWindow: { open: async (...a: unknown[]) => (opened.push(a), how) },
			copy: async (t: string) => void copied.push(t),
		});
		const a = agent();
		expect(await hand(ports('typed'), a)).toEqual({ agent: row.name, opened: 'typed', command: null });
		expect(await hand(ports('started'), a)).toEqual({ agent: row.name, opened: 'started', command: null });
		expect(opened).toEqual([
			[a, '/work', 'Go.'],
			[a, '/work', 'Go.'],
		]);
		expect(copied).toEqual([]);
		const given = await hand(ports(null), a);
		expect(given).toEqual({ agent: row.name, opened: null, command: startCommand(a.program(), '/work', a.startArgs('Go.')) });
		expect(copied).toEqual([given.command]);
	});

	it('is handed nothing, and nothing is made for it, when it is missing or signed out, and says why in its words', async () => {
		const open = vi.fn(async () => 'typed' as const);
		const ports = { agentWindow: { open }, copy: vi.fn(async () => undefined) };
		const prepare = vi.fn(async () => ({ root: '/work', prompt: 'Go.' }));
		await expect(hand(ports, agent(missing()), prepare)).rejects.toThrow(agent().notReady.missing);
		await expect(hand(ports, agent(row.answers.signedOut), prepare)).rejects.toThrow(agent().notReady.signedOut);
		expect(prepare).not.toHaveBeenCalled();
		expect(open).not.toHaveBeenCalled();
		expect(ports.copy).not.toHaveBeenCalled();
		// One it cannot tell about is still handed the work: what it is handed says a real failure.
		expect((await hand(ports, agent(row.answers.unreadable))).opened).toBe('typed');
	});

	it('undoes what was made for a hand-off its window could not then open, and nothing for one it opened', async () => {
		const undo = vi.fn();
		const prepare = async () => ({ root: '/work', prompt: 'Go.', branch: 'dsnr/handoff-x' });
		const broken = { agentWindow: { open: async () => Promise.reject(new Error('The window would not open.')) }, copy: async () => undefined };
		await expect(handOver(broken, agent(), prepare, undo)).rejects.toThrow('The window would not open.');
		expect(undo).toHaveBeenCalledExactlyOnceWith({ root: '/work', prompt: 'Go.', branch: 'dsnr/handoff-x' });
		undo.mockClear();
		await handOver({ agentWindow: { open: async () => 'typed' as const }, copy: async () => undefined }, agent(), prepare, undo);
		expect(undo).not.toHaveBeenCalled();
	});

	it('runs unattended, if it says it can, to its end: what it said, and whether it failed, never guessed', async () => {
		const a = agent();
		if (!a.runUnattended) return;
		expect(await a.runUnattended(dir, 'changed', { readOnly: [] })).toEqual({ ok: true, said: 'Changed the radius.' });
		expect(await a.runUnattended(dir, 'refused', { readOnly: [] })).toEqual({ ok: false, said: 'That is not a value.' });
		expect(await a.runUnattended(dir, 'crashed', { readOnly: [] })).toEqual({ ok: false, said: 'It broke on line 2.' });
		const absent = row.make(join(dir, 'not-installed'), async () => '');
		expect((await absent.runUnattended?.(dir, 'changed', { readOnly: [] }))?.ok).toBe(false);
	});
});
