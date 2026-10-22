import type { ShareStatus, ShareStep } from '../../../shared/contract';
import type { ShareDescriptor } from '../products/descriptor';
import { prototypeDir } from '../../../shared/designPaths';
import { isSafeBranchName } from '../platform/git';
import { errorText } from '../../../shared/result';
import { CHANGE_REQUEST } from '../../../shared/vocabulary';
import type { ShareTools } from '../../ports';

/**
 * A *draft* pull request because the repository's CI builds pull requests. A function over `ShareTools`, so its order and
 * failures test with no network.
 */

export interface ShareRequest {
	share: ShareDescriptor;
	prototypeId: string;
	name: string;
	branch: string;
	title: string;
	body: string;
}

export interface ShareTimings {
	pollMs: number;
	/** How long to wait for the deploy workflow to show up at all. */
	startupMs: number;
	/** Giving up waiting; the build may still finish. */
	timeoutMs: number;
	/** Allowance for this machine's clock and GitHub's differing. */
	skewMs: number;
}

export const DEFAULT_TIMINGS: ShareTimings = { pollMs: 10_000, startupMs: 180_000, timeoutMs: 25 * 60_000, skewMs: 120_000 };

export const previewUrlFor = (share: ShareDescriptor, pr: number): string => share.url.replace('<pr>', String(pr));

export const pullRequestText = (prototypeId: string, name: string): { title: string; body: string } => ({
	title: `Preview: ${prototypeId} ${name} (not for merge)`,
	body: [
		`This is a **draft ${CHANGE_REQUEST} that exists only to build a preview link** for review in DSNR.`,
		'It is not headed for the trunk and should not be merged or marked ready for review.',
		'',
		`The prototype record, with the brief and the comments, is \`${prototypeDir(prototypeId)}\` in the design repository.`,
		'',
		'_Opened by DSNR._',
	].join('\n'),
});

export const runShare = async (
	req: ShareRequest,
	tools: ShareTools,
	onStep: (step: ShareStep, detail?: string) => void,
	timings: ShareTimings = DEFAULT_TIMINGS,
	isLive: () => boolean = () => true,
): Promise<{ url: string; prUrl: string }> => {
	// Only codebase work is on a branch, so only it is shared: a prototype is a page, published to its own.
	if (!req.share.kinds.includes('codebase')) {
		throw new Error(
			'This repository does not build a preview for codebase work (its .dsnr/workspace.json share.kinds), so it cannot be shared from here.',
		);
	}
	// It goes to git and gh as an argument; it comes from this person's own record, but is checked all the same.
	if (!isSafeBranchName(req.branch)) {
		throw new Error(`"${req.branch}" is not a branch name that can be shared.`);
	}

	onStep('pushing');
	const pushedAt = tools.now();
	const { pushed } = await tools.push(req.branch);
	if (!isLive()) throw new Error('Sharing was stopped.');

	onStep('opening');
	const pr = (await tools.findPr(req.branch)) ?? (await tools.createDraftPr(req.branch, req.title, req.body));
	if (!isLive()) throw new Error('Sharing was stopped.');

	// Checks left over from the previous push are not evidence about this one, so when something new went up, only checks
	// that started after it count. When nothing new went up, the existing ones are the answer.
	const cutoff = pushed ? pushedAt - timings.skewMs : Number.NEGATIVE_INFINITY;
	const waitStart = tools.now();
	for (;;) {
		const mine = (await tools.checks(pr.number)).filter((c) => c.workflow === req.share.workflow && !(Date.parse(c.startedAt) < cutoff));

		if (mine.length === 0) {
			if (tools.now() - waitStart > timings.startupMs) {
				throw new Error(
					`The "${req.share.workflow}" workflow did not start for ${pr.url}. The preview is not being built, so there is no address to share.`,
				);
			}
			onStep('building', 'Waiting for the build to start');
		} else {
			const bad = mine.find((c) => c.bucket === 'fail' || c.bucket === 'cancel');
			if (bad) {
				throw new Error(`"${bad.name}" did not succeed, so there is no preview to share. Its log: ${bad.link || pr.url}`);
			}
			const waiting = mine.filter((c) => c.bucket !== 'pass' && c.bucket !== 'skipping');
			if (waiting.length === 0) break;
			onStep('building', waiting.map((c) => c.name).join(', '));
		}

		if (tools.now() - waitStart > timings.timeoutMs) {
			throw new Error(
				`The preview was still building after ${Math.round(timings.timeoutMs / 60_000)} minutes. It may yet finish: share again to check.`,
			);
		}
		await tools.sleep(timings.pollMs);
		if (!isLive()) throw new Error('Sharing was stopped.');
	}

	return { url: previewUrlFor(req.share, pr.number), prUrl: pr.url };
};

export interface ShareJob {
	request: ShareRequest;
	tools: ShareTools;
	/** Also publishes the record, so reviewers can open the address. */
	record(url: string, prUrl: string): Promise<void>;
	timings?: ShareTimings;
}

/** Lives in the core, so leaving the screen does not lose a share that takes minutes. */
export class ShareRunner {
	private current: ShareStatus = { state: 'idle' };
	private live = false;

	constructor(private readonly onStatus: (status: ShareStatus) => void) {}

	status(): ShareStatus {
		return this.current;
	}

	private set(status: ShareStatus): void {
		this.current = status;
		this.onStatus(status);
	}

	/** Stops waiting. Nothing already pushed is undone. */
	stop(): void {
		this.live = false;
	}

	start(job: ShareJob): ShareStatus {
		if (this.current.state === 'running') {
			throw new Error(`Already sharing ${this.current.prototypeId} ${this.current.name}. Wait for it to finish.`);
		}
		const { prototypeId, name } = job.request;
		this.live = true;
		this.set({ state: 'running', prototypeId, name, step: 'pushing' });

		void (async () => {
			try {
				const { url, prUrl } = await runShare(
					job.request,
					job.tools,
					(step, detail) => {
						if (this.live) this.set({ state: 'running', prototypeId, name, step, ...(detail ? { detail } : {}) });
					},
					job.timings,
					() => this.live,
				);
				await job.record(url, prUrl);
				this.set({ state: 'ready', prototypeId, name, url, prUrl });
			} catch (err) {
				this.set({ state: 'failed', prototypeId, name, message: errorText(err) });
			} finally {
				this.live = false;
			}
		})();
		return this.current;
	}
}
