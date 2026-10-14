import { describe, expect, it, vi } from 'vitest';
import { type AddressDeps, addressComment } from '../extension/src/address';
import type { AgentStatus, Project } from '../src/shared/contract';
import { ok } from '../src/shared/result';

/**
 * Address on a prototype's comment, from its review in VS Code (ELECTRON_MIGRATION_PLAN 4.2): the app's own Address
 * (`runPrototypeAddress`), shown as a build is, with Stop and its log; then the review shows where the change went, and
 * says so, or says the agent changed nothing.
 */

const review = { projectId: 'demo', name: 'v1-i1', title: 'Demo · V1 · I1' };
const comment = { thread: 4, id: 40 };
const finished: AgentStatus = { state: 'finished', exitCode: 0, work: 'prototype/demo/v1-i1', purpose: null };
const iteration = (name: string) => ({ name, branch: `prototype/demo/${name}`, createdAt: `2026-10-0${name.at(-1)}T10:00:00Z` });
const demo = {
	id: 'demo',
	title: 'Demo',
	folder: null,
	records: [],
	iterations: [iteration('v1-i1'), iteration('v1-i2')],
	people: [],
} as unknown as Project;

const world = (addressed: { changed: boolean; iteration: string } = { changed: true, iteration: 'v1-i1' }) => {
	const said: string[] = [];
	const told: string[] = [];
	const api = {
		agentReadiness: vi.fn(async () => ok({ state: 'ready' })),
		addressPrototype: vi.fn(async () => ok({ state: 'running', startedAt: '', work: 'prototype/demo/v1-i1', purpose: null })),
		agentStatus: vi.fn(async () => ok(finished)),
		finishPrototypeAddress: vi.fn(async () => ok({ ...addressed, made: null, comment })),
		listProjects: vi.fn(async () => ok([demo])),
		stopAgent: vi.fn(async () => ok(null)),
		onAgentLog: vi.fn(() => () => undefined),
	};
	const deps: AddressDeps = {
		api: api as unknown as AddressDeps['api'],
		progress: vi.fn(async (title, task) => {
			said.push(title);
			await task((m: string) => void said.push(m));
		}),
		log: { start: vi.fn(), line: vi.fn() },
		tell: (m) => void told.push(m),
		show: vi.fn(async () => undefined),
		pollMs: 0,
	};
	return { deps, api, said, told };
};

describe('addressing a comment from a review', () => {
	it('runs the agent on the one comment, said as it goes, shows the changed page, and says which it is', async () => {
		const { deps, api, said, told } = world();
		// It says which iteration it showed, for whoever asked to go to it (a browser).
		expect(await addressComment(deps, review, comment)).toBe('v1-i1');
		expect(api.addressPrototype).toHaveBeenCalledWith('demo', 'v1-i1', comment);
		expect(said).toEqual(['Addressing a comment on Demo · V1 · I1', 'The agent is working on the comment. This takes a few minutes.']);
		expect(deps.log.start).toHaveBeenCalledWith('Demo · V1 · I1: addressing a comment');
		expect(told).toEqual(['The agent has finished. Look at the page, then resolve what is done.']);
		expect(deps.show).toHaveBeenCalledWith(review);
	});

	it('shows the next iteration when others had commented on this one, and says why', async () => {
		const { deps, told } = world({ changed: true, iteration: 'v1-i2' });
		expect(await addressComment(deps, review, comment)).toBe('v1-i2');
		expect(told).toEqual(['Others had commented on V1 · I1, so it stays as they saw it. The change is in V1 · I2.']);
		expect(deps.show).toHaveBeenCalledWith({ projectId: 'demo', name: 'v1-i2', title: 'Demo · V1 · I2' });
	});

	it('says when the agent changed nothing, and leaves the review as it is', async () => {
		const { deps, told } = world({ changed: false, iteration: 'v1-i1' });
		expect(await addressComment(deps, review, comment)).toBeNull();
		expect(told[0]).toMatch(/^The agent finished without changing anything\. Its log says why/);
		expect(deps.show).not.toHaveBeenCalled();
	});

	it('stops when Stop is pressed, and finishes nothing', async () => {
		const { deps, api } = world();
		deps.progress = vi.fn(async (_title, task, onStop) => {
			onStop();
			await task(() => undefined);
		});
		expect(await addressComment(deps, review, comment)).toBeNull();
		expect(api.stopAgent).toHaveBeenCalled();
		expect(api.finishPrototypeAddress).not.toHaveBeenCalled();
		expect(deps.show).not.toHaveBeenCalled();
	});

	it('fails saying why, and before anything when Claude Code is not here', async () => {
		const failing = world();
		failing.api.addressPrototype.mockResolvedValue({ ok: false, error: 'The comment is resolved.' } as never);
		await expect(addressComment(failing.deps, review, comment)).rejects.toThrow('The comment was not addressed: The comment is resolved.');
		const missing = world();
		missing.api.agentReadiness.mockResolvedValue(ok({ state: 'missing' }) as never);
		await expect(addressComment(missing.deps, review, comment)).rejects.toThrow(/Claude Code is not installed/);
		expect(missing.api.addressPrototype).not.toHaveBeenCalled();
	});
});
