import { describe, expect, it, vi } from 'vitest';
import type { PublishStatus } from '../src/shared/contract';
import { PublishManager, type PublishContext, publishInOrder } from '../src/main/services/publisher';
import { PublishConsent } from '../src/main/services/publishConsent';
import type { SyncResult } from '../src/main/services/designSync';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ok: SyncResult = { published: [], problems: [] };
const bad = (what: string, why: string): SyncResult => ({ published: [], problems: [{ what, why }] });

/** A consent store in memory, and a context whose run we control. */
const make = (initial: boolean | null, run: PublishContext['run'] = async () => ({ branches: ok, records: ok }), opts: { gap?: number; none?: boolean } = {}) => {
	let consent = initial;
	const statuses: PublishStatus[] = [];
	const runSpy = vi.fn(run);
	const manager = new PublishManager(
		{
			consent: { read: () => consent, write: (v) => void (consent = v) },
			context: async () => (opts.none ? null : { run: runSpy }),
			now: () => new Date('2026-10-06T12:00:00Z'),
			minGapMs: opts.gap ?? 0,
		},
		(s) => statuses.push(s),
	);
	return { manager, runSpy, statuses, consent: () => consent };
};

describe('consent', () => {
	it('publishes nothing, and says it is waiting for an answer, until the person has given one', async () => {
		const { manager, runSpy } = make(null);
		expect(manager.status()).toEqual({ state: 'needs-consent' });
		await manager.publish(true);
		expect(runSpy).not.toHaveBeenCalled();
		expect(manager.status()).toEqual({ state: 'needs-consent' });
	});

	it('does not ask again after a no, however often it is triggered', async () => {
		const { manager, runSpy } = make(false);
		for (let i = 0; i < 3; i++) await manager.publish(true);
		expect(runSpy).not.toHaveBeenCalled();
		expect(manager.status()).toEqual({ state: 'off' });
	});

	it('starts publishing at once on a yes, and remembers it', async () => {
		const { manager, runSpy, consent } = make(null);
		await manager.setConsent(true);
		expect(consent()).toBe(true);
		expect(runSpy).toHaveBeenCalledTimes(1);
		expect(manager.status()).toEqual({ state: 'shared', at: '2026-10-06T12:00:00.000Z' });
	});

	it('stops at once on a no, and remembers that too', async () => {
		const { manager, runSpy, consent } = make(true);
		await manager.setConsent(false);
		expect(consent()).toBe(false);
		await manager.publish(true);
		expect(runSpy).not.toHaveBeenCalled();
		expect(manager.status()).toEqual({ state: 'off' });
	});

	it('can be turned on again later, from off', async () => {
		const { manager, runSpy } = make(false);
		await manager.setConsent(true);
		expect(runSpy).toHaveBeenCalledTimes(1);
	});
});

describe('running', () => {
	it('reports working, then shared', async () => {
		const { manager, statuses } = make(true);
		await manager.publish(true);
		expect(statuses.map((s) => s.state)).toEqual(['working', 'shared']);
	});

	it('shows every problem from both syncs, with their reasons, and clears them when the next run gets through', async () => {
		let healthy = false;
		const { manager } = make(true, async () => (healthy ? { branches: ok, records: ok } : { branches: bad('feature/x', 'It has moved on GitHub.'), records: bad('Project records', 'Could not reach GitHub.') }));
		await manager.publish(true);
		expect(manager.status()).toMatchObject({ state: 'held', problems: [{ what: 'feature/x' }, { what: 'Project records' }] });
		healthy = true;
		await manager.publish(true);
		expect(manager.status()).toMatchObject({ state: 'shared' });
	});

	it('turns an unexpected failure into a visible problem and stays usable', async () => {
		let boom = true;
		const { manager } = make(true, async () => {
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
		const { manager, runSpy } = make(true, undefined, { none: true });
		await manager.publish(true);
		expect(manager.status()).toEqual({ state: 'unavailable' });
		expect(runSpy).not.toHaveBeenCalled();
	});
});

describe('triggers', () => {
	it('collapses many requests during a run into exactly one more run, which sees what was written meanwhile', async () => {
		let release: () => void = () => undefined;
		let calls = 0;
		const { manager, runSpy } = make(true, async () => {
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
		const { manager } = make(true, async () => {
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
		const { manager, runSpy } = make(true, undefined, { gap: 60 });
		await manager.publish(true);
		await manager.publish();
		await manager.publish();
		await manager.publish();
		expect(runSpy).toHaveBeenCalledTimes(1); // not yet: too soon
		await new Promise((r) => setTimeout(r, 160));
		expect(runSpy).toHaveBeenCalledTimes(2); // one for all three triggers, once the gap has passed
	});

	it('runs straight away when forced, spacing or not', async () => {
		const { manager, runSpy } = make(true, undefined, { gap: 60_000 });
		await manager.publish(true);
		await manager.publish(true);
		expect(runSpy).toHaveBeenCalledTimes(2);
	});

	it('does not run a delayed trigger after the person says no', async () => {
		const { manager, runSpy } = make(true, undefined, { gap: 60 });
		await manager.publish(true);
		await manager.publish();
		await manager.setConsent(false);
		await new Promise((r) => setTimeout(r, 160));
		expect(runSpy).toHaveBeenCalledTimes(1);
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
		const r = await publishInOrder(async () => bad('feature/x', 'moved'), async () => ok);
		expect(r.branches.problems).toHaveLength(1);
		expect(r.records.problems).toHaveLength(0);
	});
});

describe('the consent file', () => {
	it('keeps a yes and a no, and tells "not asked yet" apart from "no"', () => {
		const dir = mkdtempSync(join(tmpdir(), 'fdw-consent-'));
		try {
			const c = new PublishConsent(join(dir, 'sub', 'publish.json'));
			expect(c.read()).toBeNull();
			c.write(false);
			expect(c.read()).toBe(false);
			c.write(true);
			expect(c.read()).toBe(true);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it('treats a damaged file as not asked yet, rather than as a yes', () => {
		const dir = mkdtempSync(join(tmpdir(), 'fdw-consent-'));
		try {
			const c = new PublishConsent(join(dir, 'publish.json'));
			c.write(true);
			require('node:fs').writeFileSync(join(dir, 'publish.json'), '{"allowed": "yes please"');
			expect(c.read()).toBeNull();
			require('node:fs').writeFileSync(join(dir, 'publish.json'), '{"allowed": "true"}');
			expect(c.read()).toBeNull();
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
