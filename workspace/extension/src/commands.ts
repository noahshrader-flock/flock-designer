import { readReview } from './asks';
import { type HostMessage, type Review, readProjectArg } from './messages';

/** What the commands need of VS Code and of the rest of the extension: a slice, so a test gives its own. */
export interface CommandDeps {
	run: (command: string) => PromiseLike<unknown>;
	tell: (message: string) => void;
	inPanel: (message: HostMessage) => Promise<void>;
	openReview: (review: Review) => Promise<void>;
	pickReview: () => Promise<Review | null | undefined>;
	activeReview: () => Review | undefined;
	openPublishedPage: (review: Review) => Promise<void>;
	copyPublishedLink: (review: Review) => Promise<void>;
	signIn: () => Promise<unknown>;
	signedIn: () => boolean;
	failed: (err: unknown) => void;
	failedFor: (fromCode: boolean) => (err: unknown) => void;
	chooseAgent: () => Promise<unknown>;
	locateDesignRepository: () => Promise<void>;
	chooseDesignSystem: () => Promise<void>;
}

/** DSNR's commands but the design system's and voice and tone's, by id; `raw` is what a caller passed, unchecked. */
export const commands = (d: CommandDeps): Record<string, (raw?: unknown) => unknown> => {
	const inFront = (act: (review: Review) => Promise<void>) => {
		const review = d.activeReview();
		if (!review) return d.tell('Open a prototype for review first.');
		return act(review).catch(d.failed);
	};
	return {
		'dsnr.open': () => d.run('workbench.view.extension.dsnr'),
		'dsnr.getStarted': () => d.run('git.clone'),
		'dsnr.openReview': async (raw) => {
			if (raw !== undefined) {
				const given = readReview(raw);
				if (!given) throw new Error('DSNR: Open a prototype for review was given something that is not a review.');
				return d.openReview(given).catch(d.failedFor(true));
			}
			const picked = await d.pickReview().catch(d.failed);
			if (picked) await d.openReview(picked).catch(d.failed);
		},
		'dsnr.openPublishedPage': () => inFront(d.openPublishedPage),
		'dsnr.copyPublishedLink': () => inFront(d.copyPublishedLink),
		'dsnr.assignFolder': (raw) => {
			const projectId = readProjectArg(raw) ?? d.activeReview()?.projectId;
			if (!projectId) return d.tell('Right-click a project in DSNR, or open one for review, to assign its folder.');
			return d.inPanel({ type: 'open-dialog', dialog: { kind: 'assign', projectId } });
		},
		'dsnr.buildInCodebase': () => inFront((review) => d.inPanel({ type: 'open-dialog', dialog: { kind: 'build', projectId: review.projectId } })),
		'dsnr.sync': () => d.inPanel({ type: 'open-dialog', dialog: { kind: 'sync' } }),
		'dsnr.signIn': () => d.signIn().catch(d.failed),
		'dsnr.account': () => {
			if (d.signedIn()) return d.inPanel({ type: 'open-dialog', dialog: { kind: 'account' } });
		},
		'dsnr.chooseAgent': () => d.chooseAgent().catch(d.failed),
		'dsnr.locateDesignRepository': () => d.locateDesignRepository().catch(d.failed),
		'dsnr.chooseDesignSystem': () => d.chooseDesignSystem().catch(d.failed),
	};
};
