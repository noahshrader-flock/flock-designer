import { describe, expect, it, vi } from 'vitest';
import type { AgentId, AgentReadiness } from '../src/core/services/agent/agent';
import { type Choice, type Offered, chooseAgent } from '../src/core/services/agent/choose';

const ready: AgentReadiness = { state: 'ready' };
const signedOut = (name: string): AgentReadiness => ({ state: 'signedOut', said: `${name} is not signed in.` });
const missing = (name: string): AgentReadiness => ({ state: 'missing', said: `${name} is not installed.` });
const unknown: AgentReadiness = { state: 'unknown' };
const agent = (id: AgentId, name: string, readiness: AgentReadiness): Offered => ({ id, name, readiness });

const world = (choice: Choice, answer: { id: AgentId; keep: boolean } | null = null) => {
	const pick = vi.fn(async () => answer);
	const keep = vi.fn(async () => undefined);
	return { deps: { choice: () => choice, pick, keep }, pick, keep };
};

const claude = (r: AgentReadiness = ready) => agent('claude-code', 'Claude Code', r);
const codex = (r: AgentReadiness = ready) => agent('codex', 'Codex', r);
const copilot = (r: AgentReadiness = unknown) => agent('copilot', 'GitHub Copilot', r);

describe('which agent work goes to', () => {
	it('is the one signed in, when there is one, with no question: one it cannot tell about does not ask', async () => {
		const { deps, pick } = world('ask');
		expect(await chooseAgent([claude(), codex(signedOut('Codex')), copilot()], deps)).toBe('claude-code');
		expect(await chooseAgent([claude(missing('Claude Code')), codex(missing('Codex')), copilot()], deps)).toBe('copilot');
		expect(pick).not.toHaveBeenCalled();
	});

	it('asks once when several are signed in, offering only those it can use, and keeps the answer when asked to', async () => {
		const { deps, pick, keep } = world('ask', { id: 'codex', keep: true });
		expect(await chooseAgent([claude(), codex(), copilot(missing('GitHub Copilot'))], deps)).toBe('codex');
		expect(pick).toHaveBeenCalledWith([claude(), codex()], null, 'ask');
		expect(keep).toHaveBeenCalledWith('codex');
		const once = world('ask', { id: 'codex', keep: false });
		expect(await chooseAgent([claude(), codex()], once.deps)).toBe('codex');
		expect(once.keep).not.toHaveBeenCalled();
	});

	it('is the kept one, with no question, whoever else is signed in', async () => {
		const { deps, pick } = world('codex');
		expect(await chooseAgent([claude(), codex(), copilot()], deps)).toBe('codex');
		expect(pick).not.toHaveBeenCalled();
	});

	it('asks, saying why in the agent’s words, when the kept one cannot be used: never another in silence', async () => {
		const { deps, pick } = world('codex', { id: 'claude-code', keep: true });
		expect(await chooseAgent([claude(), codex(signedOut('Codex'))], deps)).toBe('claude-code');
		expect(pick).toHaveBeenCalledWith([claude()], 'Codex is not signed in.', 'codex');
	});

	it('asks whatever is kept when the person asks to change it, and says null when they dismiss it', async () => {
		const { deps, pick } = world('codex');
		expect(await chooseAgent([claude(), codex()], deps, { always: true })).toBeNull();
		expect(pick).toHaveBeenCalledWith([claude(), codex()], null, 'codex');
	});

	it('names every agent to sign in to when none can be used, and asks nothing', async () => {
		const { deps, pick } = world('ask');
		await expect(chooseAgent([claude(missing('Claude Code')), codex(signedOut('Codex')), copilot(missing('GitHub Copilot'))], deps)).rejects.toThrow(
			'No agent is signed in here. Sign in to Claude Code, Codex or GitHub Copilot, then start again.',
		);
		expect(pick).not.toHaveBeenCalled();
	});
});
