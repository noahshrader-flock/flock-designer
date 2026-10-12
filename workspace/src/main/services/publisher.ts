import type { PublishProblem, PublishStatus } from '../../shared/contract';
import type { SyncResult } from './designSync';
import { coalescing } from './concurrency';
import { errorText } from '../../shared/result';

/**
 * Keeps the person's work published, by itself.
 *
 * It runs the two syncs in order, because order is the point: a project's branch goes up first, so the
 * design repository never points at a branch that exists only on one machine; then the project records.
 * It starts when the app opens, when the window is focused, when the list is refreshed and after any
 * record is written, and overlapping requests collapse into one more run rather than queueing up.
 *
 * It asks nothing and blocks nothing. Publishing is what this app is for, so there is no permission step:
 * what protects the person is how narrow it is (their own branches, plain pushes, only the project records;
 * see `branchSync` and `designSync`). A failure is shown with its reason and retried on the next trigger,
 * never silent.
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
	/** Null when this machine has no product repository, or no design repository beside it. */
	context(): Promise<PublishContext | null>;
	now?: () => Date;
	/** Triggers closer together than this are ignored, so focusing the window repeatedly is cheap. */
	minGapMs?: number;
}

export class PublishManager {
	private current: PublishStatus;
	/** One run at a time, and one more for whatever asks during it, so nothing written meanwhile waits for a later trigger. */
	private readonly runs = coalescing(() => this.runOnce());
	private lastFinished = 0;
	private timer: ReturnType<typeof setTimeout> | null = null;

	constructor(
		private readonly deps: PublishDeps,
		private readonly onStatus: (status: PublishStatus) => void = () => undefined,
	) {
		this.current = { state: 'unavailable' };
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

	/**
	 * Publishes now, or notes that it should, and resolves when the run that covers this request is done.
	 * `force` skips the spacing between runs (a person asked, or something was just written).
	 */
	publish(force = false): Promise<void> {
		if (this.runs.running) return this.runs();
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
		return this.runs().finally(() => {
			this.lastFinished = Date.now();
		});
	}

	private async runOnce(): Promise<void> {
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
			problems.push({ what: 'Publishing', why: errorText(err, { firstLine: true }) });
		}
		const at = this.clock().toISOString();
		this.set(problems.length === 0 ? { state: 'shared', at } : { state: 'held', problems, at });
	}
}
