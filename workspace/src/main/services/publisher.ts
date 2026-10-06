import type { PublishProblem, PublishStatus } from '../../shared/contract';
import type { SyncResult } from './designSync';

/**
 * Keeps the person's work published, by itself.
 *
 * It runs the two syncs in order, because order is the point: a project's branch goes up first, so the
 * design repository never points at a branch that exists only on one machine; then the project records.
 * It starts when the app opens, when the window is focused, when the list is refreshed and after any
 * record is written, and overlapping requests collapse into one more run rather than queueing up.
 *
 * It asks nothing mid-flight and blocks nothing. Without the person's one-time yes it publishes nothing
 * and says so; with it, a failure is shown with its reason and retried on the next trigger. It is never
 * silent either way.
 */

/**
 * Branches first, then records, always in that order and never together: a project's record must not reach
 * GitHub before the branch it names does, or a reviewer is shown a project they cannot open.
 */
export const publishInOrder = async <B extends SyncResult>(
	branches: () => Promise<B>,
	/** Given what the branches step found, so records can be made for the work that is there. */
	records: (branches: B) => Promise<SyncResult>,
): Promise<{ branches: SyncResult; records: SyncResult }> => {
	const b = await branches();
	return { branches: b, records: await records(b) };
};

export interface PublishContext {
	/** What to hand to the two syncs; null when there is nothing to publish from here. */
	run(): Promise<{ branches: SyncResult; records: SyncResult }>;
}

export interface PublishDeps {
	consent: { read(): boolean | null; write(allowed: boolean): void };
	/** Null when this machine has no product repository, or no design repository beside it. */
	context(): Promise<PublishContext | null>;
	now?: () => Date;
	/** Triggers closer together than this are ignored, so focusing the window repeatedly is cheap. */
	minGapMs?: number;
}

export class PublishManager {
	private current: PublishStatus;
	private running: Promise<void> | null = null;
	private again = false;
	private lastFinished = 0;
	private timer: ReturnType<typeof setTimeout> | null = null;

	constructor(
		private readonly deps: PublishDeps,
		private readonly onStatus: (status: PublishStatus) => void = () => undefined,
	) {
		const c = deps.consent.read();
		this.current = c === null ? { state: 'needs-consent' } : c ? { state: 'unavailable' } : { state: 'off' };
	}

	status(): PublishStatus {
		return this.current;
	}

	private set(status: PublishStatus): void {
		this.current = status;
		this.onStatus(status);
	}

	private clock(): Date {
		return (this.deps.now ?? (() => new Date()))();
	}

	/** The person's answer. A yes starts a run at once; a no stops everything and is not asked again. */
	setConsent(allowed: boolean): Promise<void> {
		this.deps.consent.write(allowed);
		if (!allowed) {
			if (this.timer) clearTimeout(this.timer);
			this.timer = null;
			this.set({ state: 'off' });
			return Promise.resolve();
		}
		return this.publish(true);
	}

	/**
	 * Publishes now, or notes that it should, and resolves when the run that covers this request is done.
	 * `force` skips the spacing between runs (a person asked, or something was just written).
	 */
	publish(force = false): Promise<void> {
		const c = this.deps.consent.read();
		if (c === null) {
			this.set({ state: 'needs-consent' });
			return Promise.resolve();
		}
		if (c === false) {
			this.set({ state: 'off' });
			return Promise.resolve();
		}
		if (this.running) {
			this.again = true;
			return this.running;
		}
		const wait = this.lastFinished + (this.deps.minGapMs ?? 15_000) - Date.now();
		if (!force && wait > 0) {
			// Too soon after the last run to start another, but not too soon to forget: one run is made for
			// however many triggers arrive meanwhile, as soon as the spacing allows. Dropping them would leave
			// work made just after a run waiting for some later trigger that might not come.
			this.timer ??= setTimeout(() => {
				this.timer = null;
				void this.publish(true);
			}, wait);
			return Promise.resolve();
		}
		this.running = this.run().finally(() => {
			this.running = null;
			this.lastFinished = Date.now();
		});
		return this.running;
	}

	private async run(): Promise<void> {
		let again = true;
		while (again) {
			again = false;
			const ctx = await this.deps.context().catch(() => null);
			if (ctx === null) {
				this.set({ state: 'unavailable' });
				return;
			}
			this.set({ state: 'working' });
			const problems: PublishProblem[] = [];
			try {
				const { branches, records } = await ctx.run();
				problems.push(...branches.problems, ...records.problems);
			} catch (err) {
				problems.push({ what: 'Publishing', why: err instanceof Error ? err.message.split('\n')[0] ?? String(err) : String(err) });
			}
			const at = this.clock().toISOString();
			this.set(problems.length === 0 ? { state: 'shared', at } : { state: 'held', problems, at });
			// Something asked for another run while this one was going: do exactly one more, so nothing written
			// during a run is left for the next trigger.
			if (this.again) {
				this.again = false;
				again = true;
			}
		}
	}
}
