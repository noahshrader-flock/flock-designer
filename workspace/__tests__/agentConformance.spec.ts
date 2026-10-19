import { spawn } from 'node:child_process';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { type Agent, claudeCode } from '../src/core/services/agent/agent';
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
	/** Prints as that agent does: the task says how the run ends (`changed`, `refused`, `crashed`). */
	stream: string;
}

const ROWS: Row[] = [
	{
		name: 'Claude Code',
		make: (bin, answer) =>
			claudeCode({
				locate: () => bin,
				run: async () => {
					const a = await answer();
					if (a instanceof Error) throw a;
					return a;
				},
				spawnProcess: spawn,
			}),
		answers: { ready: '{"loggedIn":true}', signedOut: '{"loggedIn":false}', unreadable: 'Logged in as someone' },
		stream: `const task = process.argv[process.argv.indexOf('-p') + 1];
const say = (e) => process.stdout.write(JSON.stringify(e) + '\\n');
say({ type: 'assistant', message: { content: [{ type: 'text', text: 'Looking.' }] } });
if (task === 'crashed') { process.stderr.write('It broke on line 2.'); process.exit(2); }
say({ type: 'result', is_error: task === 'refused', result: task === 'refused' ? 'That is not a value.' : 'Changed the radius.' });`,
	},
];

/** Handed `Go.` in `/work`; `prepare` counts what would have been made for it. */
const hand = (ports: Parameters<typeof handOver>[0], a: Agent, prepare = vi.fn(async () => ({ root: '/work', prompt: 'Go.' }))) =>
	handOver(ports, a, prepare).then((r) => r.handed);

const missing = (): Error => Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' });

describe.each(ROWS)('$name, behind the seam', (row) => {
	const bin = program(`${row.name.replace(/\W/g, '')}-stand-in`, row.stream);
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

	it('starts in a terminal in the folder, with the prompt as one quoted argument', () => {
		if (process.platform === 'win32') return;
		expect(agent().terminalCommand('/work/my lib', 'Build it, "now".')).toBe(`cd '/work/my lib' && ${bin} 'Build it, "now".'`);
	});

	it('is handed work in its own window when the editor has one, and given as a terminal command when not', async () => {
		const copied: string[] = [];
		const opened: unknown[][] = [];
		const ports = (window: boolean) => ({
			agentWindow: { open: async (...a: unknown[]) => (opened.push(a), window) },
			copy: async (t: string) => void copied.push(t),
		});
		const a = agent();
		expect(await hand(ports(true), a)).toEqual({ agent: row.name, editor: true, command: null });
		expect(opened).toEqual([[a.id, '/work', 'Go.']]);
		expect(copied).toEqual([]);
		const given = await hand(ports(false), a);
		expect(given).toEqual({ agent: row.name, editor: false, command: a.terminalCommand('/work', 'Go.') });
		expect(copied).toEqual([given.command]);
	});

	it('is handed nothing, and nothing is made for it, when it is missing or signed out, and says why in its words', async () => {
		const open = vi.fn(async () => true);
		const ports = { agentWindow: { open }, copy: vi.fn(async () => undefined) };
		const prepare = vi.fn(async () => ({ root: '/work', prompt: 'Go.' }));
		await expect(hand(ports, agent(missing()), prepare)).rejects.toThrow(agent().notReady.missing);
		await expect(hand(ports, agent(row.answers.signedOut), prepare)).rejects.toThrow(agent().notReady.signedOut);
		expect(prepare).not.toHaveBeenCalled();
		expect(open).not.toHaveBeenCalled();
		expect(ports.copy).not.toHaveBeenCalled();
		// One it cannot tell about is still handed the work: what it is handed says a real failure.
		expect((await hand(ports, agent(row.answers.unreadable))).editor).toBe(true);
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
