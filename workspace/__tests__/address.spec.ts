import { describe, expect, it, vi } from 'vitest';
import { type AddressPhase, runPrototypeAddress } from '../extension/src/prototypeAddress';
import type { AgentStatus, Result } from '../src/shared/contract';
import { agentFinished, agentRunning } from './fixtures';

describe('runPrototypeAddress', () => {
	const ok = <T>(value: T): Result<T> => ({ ok: true, value });
	const started: AgentStatus = agentRunning();
	const finished: AgentStatus = agentFinished();
	const addressed = { changed: true, version: 'v2', made: null, comment: { id: 7 } } as never;
	const run = async (api: Partial<Parameters<typeof runPrototypeAddress>[0]['api']>, isLive = () => true) => {
		const phases: AddressPhase[] = [];
		await runPrototypeAddress({
			api: {
				addressPrototype: async () => ok(started),
				agentStatus: async () => ok(finished),
				finishPrototypeAddress: async () => ok(addressed),
				...api,
			},
			projectId: 'demo',
			name: 'v1',
			newVersion: false,
			comment: { thread: 1, id: 7 },
			isLive,
			onPhase: (p) => phases.push(p),
			pollMs: 1,
		});
		return phases;
	};

	it('waits for the agent, then says where the change went, as the core found it', async () => {
		const finish = vi.fn(async () => ok(addressed));
		const phases = await run({ finishPrototypeAddress: finish });
		expect(finish).toHaveBeenCalledWith({ thread: 1, id: 7 });
		expect(phases).toEqual([{ kind: 'running' }, { kind: 'done', changed: true, commit: null, prototype: addressed }]);
	});

	it('says why when finishing fails, as when the changed page does not build', async () => {
		const phases = await run({ finishPrototypeAddress: async () => ({ ok: false, error: 'The prototype did not build' }) });
		expect(phases.at(-1)).toEqual({ kind: 'failed', message: 'The prototype did not build' });
	});

	it('leaves finishing to the core when nobody is looking any more', async () => {
		let live = true;
		const finish = vi.fn();
		const phases = await run({ agentStatus: async () => ((live = false), ok(started)), finishPrototypeAddress: finish }, () => live);
		expect(phases.map((p) => p.kind)).toEqual(['running']);
		expect(finish).not.toHaveBeenCalled();
	});
});
