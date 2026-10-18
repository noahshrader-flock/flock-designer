import { describe, expect, it, vi } from 'vitest';
import type { PublishStatus } from '../src/shared/contract';
import { PublishManager, type PublishContext, publishInOrder } from '../src/core/services/publisher';
import type { SyncResult } from '../src/core/services/designSync';

const ok: SyncResult = { published: [], problems: [] };
const bad = (what: string, why: string): SyncResult => ({ published: [], problems: [{ what, why }] });

/** A context whose run we control. */
const make = (run: PublishContext['run'] = async () => ({ branches: ok, records: ok }), opts: { gap?: number; none?: boolean } = {}) => {
	const statuses: PublishStatus[] = [];
	const runSpy = vi.fn(run);
	const manager = new PublishManager(
		{
			context: async () => (opts.none ? null : { run: runSpy }),
			now: () => new Date('2026-10-06T12:00:00Z'),
			minGapMs: opts.gap ?? 0,
		},
		(s) => statuses.push(s),
	);
	return { manager, runSpy, statuses };
};

describe('starting', () => {
	it('has nothing to report until it has run, and needs no permission to run', async () => {
		const { manager, runSpy } = make();
		expect(manager.status()).toEqual({ state: 'unavailable' });
		await manager.publish(true);
		expect(runSpy).toHaveBeenCalledTimes(1);
		expect(manager.status()).toEqual({ state: 'shared', at: '2026-10-06T12:00:00.000Z' });
	});
});

describe('running', () => {
	it('reports working, then shared', async () => {
		const { manager, statuses } = make();
		await manager.publish(true);
		expect(statuses.map((s) => s.state)).toEqual(['working', 'shared']);
	});

	it('shows every problem from both syncs, with their reasons, and clears them when the next run gets through', async () => {
		let healthy = false;
		const { manager } = make(async () =>
			healthy
				? { branches: ok, records: ok }
				: { branches: bad('feature/x', 'It has moved on GitHub.'), records: bad('Project records', 'Could not reach GitHub.') },
		);
		await manager.publish(true);
		expect(manager.status()).toMatchObject({ state: 'held', problems: [{ what: 'feature/x' }, { what: 'Project records' }] });
		healthy = true;
		await manager.publish(true);
		expect(manager.status()).toMatchObject({ state: 'shared' });
	});

	it('turns an unexpected failure into a visible problem and stays usable', async () => {
		let boom = true;
		const { manager } = make(async () => {
			if (boom) throw new Error('disk on fire\nstack…');
			return { branches: ok, records: ok };
		});
		await manager.publish(true);
		expect(manager.status()).toMatchObject({ state: 'held', problems: [{ what: 'Publishing', why: 'disk on fire' }] });
		boom = false;
		await manager.publish(true);
		expect(manager.status().state).toBe('shared');
	});

	it('says there is nothing to publish from here when there is no product or design repository', async () => {
		const { manager, runSpy } = make(undefined, { none: true });
		await manager.publish(true);
		expect(manager.status()).toEqual({ state: 'unavailable' });
		expect(runSpy).not.toHaveBeenCalled();
	});
});

describe('triggers', () => {
	it('collapses many requests during a run into exactly one more run, which sees what was written meanwhile', async () => {
		let release: () => void = () => undefined;
		let calls = 0;
		const { manager, runSpy } = make(async () => {
			calls++;
			if (calls === 1) await new Promise<void>((r) => (release = r));
			return { branches: ok, records: ok };
		});
		const first = manager.publish(true);
		await new Promise((r) => setTimeout(r, 5));
		const piled = [manager.publish(true), manager.publish(true), manager.publish(true)];
		release();
		await Promise.all([first, ...piled]);
		expect(runSpy).toHaveBeenCalledTimes(2);
	});

	it('does not start a second run in parallel', async () => {
		let active = 0;
		let most = 0;
		const { manager } = make(async () => {
			active++;
			most = Math.max(most, active);
			await new Promise((r) => setTimeout(r, 15));
			active--;
			return { branches: ok, records: ok };
		});
		await Promise.all([manager.publish(true), manager.publish(true)]);
		expect(most).toBe(1);
	});

	it('does not start another run too soon after one, but does not forget the trigger: it makes one run when the spacing allows', async () => {
		const { manager, runSpy } = make(undefined, { gap: 60 });
		await manager.publish(true);
		await manager.publish();
		await manager.publish();
		await manager.publish();
		expect(runSpy).toHaveBeenCalledTimes(1); // not yet: too soon
		await new Promise((r) => setTimeout(r, 160));
		expect(runSpy).toHaveBeenCalledTimes(2); // one for all three triggers, once the gap has passed
	});

	it('runs straight away when forced, spacing or not', async () => {
		const { manager, runSpy } = make(undefined, { gap: 60_000 });
		await manager.publish(true);
		await manager.publish(true);
		expect(runSpy).toHaveBeenCalledTimes(2);
	});
});

describe('order', () => {
	it('publishes branches first and only then records, so a record never gets ahead of its branch', async () => {
		const order: string[] = [];
		await publishInOrder(
			async () => (order.push('branches:start'), await new Promise((r) => setTimeout(r, 20)), order.push('branches:done'), ok),
			async () => (order.push('records'), ok),
		);
		expect(order).toEqual(['branches:start', 'branches:done', 'records']);
	});

	it('hands the records step what the branches step found, so records can be made for that work', async () => {
		let seen: unknown;
		await publishInOrder(
			async () => ({ ...ok, mine: ['feature/role-comparison'] }),
			async (found) => ((seen = found.mine), ok),
		);
		expect(seen).toEqual(['feature/role-comparison']);
	});

	it('still publishes records when a branch had a problem, and returns both results', async () => {
		const r = await publishInOrder(
			async () => bad('feature/x', 'moved'),
			async () => ok,
		);
		expect(r.branches.problems).toHaveLength(1);
		expect(r.records.problems).toHaveLength(0);
	});
});
