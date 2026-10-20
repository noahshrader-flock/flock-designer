import type { WorkspaceApi } from '../../src/shared/contract';
import { readReview } from './asks';
import { type HostMessage, type Review, readProjectArg } from './messages';
import { type Given, readAsked, readyToStart } from './newPrototype';

/** What the commands need of VS Code and of the rest of the extension: a slice, so a test gives its own. */
export interface CommandDeps {
	run: (command: string) => PromiseLike<unknown>;
	tell: (message: string) => void;
	inPanel: (message: HostMessage) => Promise<void>;
	product: () => { root: string | null; why: string };
	api: Pick<WorkspaceApi, 'agentReady' | 'warmPrototypeBase'>;
	startPrototype: (given: Given) => Promise<void>;
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
}

/** DSNR's commands but the design system's and voice and tone's, by id; `raw` is what a caller passed, unchecked. */
export const commands = (d: CommandDeps): Record<string, (raw?: unknown) => unknown> => {
	const inFront = (act: (review: Review) => Promise<void>) => {
		const review = d.activeReview();
		if (!review) return d.tell('Open a prototype for review first.');
		return act(review).catch(d.failed);
	};
	return {
		'dsnr.newPrototype': (raw) => {
			const asked = readAsked(raw);
			if (asked === 'ask')
				return readyToStart({ product: d.product(), api: d.api })
					.then(() => {
						// While the person writes what to explore, the branch it is modeled on is fetched.
						const { root } = d.product();
						if (root !== null) void d.api.warmPrototypeBase(root);
						return d.inPanel({ type: 'open-dialog', dialog: { kind: 'new' } });
					})
					.catch(d.failed);
			if (!asked) throw new Error('DSNR: New prototype was given something that is not a name and what it should explore.');
			return d.startPrototype(asked).catch(d.failedFor(true));
		},
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
	};
};
