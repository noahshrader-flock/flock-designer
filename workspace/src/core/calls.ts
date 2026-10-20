import type { DesignRepo } from '../codeHost/designRepo';
import type { Checkout, Handed } from '../shared/contract';
import { clearRoutes } from './handle';
import { registerAccount } from './calls/account';
import { registerCheckout } from './calls/checkout';
import { registerCodebase } from './calls/codebase';
import { registerDesignSystem } from './calls/designSystem';
import { registerPrototypes } from './calls/prototypes';
import { registerPublishing } from './calls/publishing';
import { registerReview } from './calls/review';
import { accountArea } from './areas/account';
import { checkoutArea } from './areas/checkout';
import { codebaseArea } from './areas/codebase';
import { designSystemArea } from './areas/designSystem';
import { prototypesArea } from './areas/prototypes';
import { publishingArea } from './areas/publishing';
import { reviewArea } from './areas/review';
import { type CallsContext, composeCore } from './compose';

/**
 * Every operation the window can reach, and nothing else. There is no generic invoke and no passthrough: each handler is
 * named, its arguments checked, and its root resolved against what the person actually opened.
 */
export const registerCalls = (
	context: CallsContext,
): {
	publish: (force?: boolean) => Promise<void>;
	/** Opens and trusts a product checkout, for the shell alone: no call from a page opens a checkout. */
	open: (root: string) => Promise<Checkout>;
	/** The design repository the open product belongs to, for the shell's own reads (a review copy, the viewer's address). */
	designRepo: () => DesignRepo;
	/** Sets up a repository open here that is not set up yet, by the person's agent: for the shell alone. */
	setUp: (root: string) => Promise<Handed | null>;
} => {
	clearRoutes();
	const d = composeCore(context);
	registerCheckout(checkoutArea(d));
	registerDesignSystem(designSystemArea(d));
	registerCodebase(codebaseArea(d));
	registerPrototypes(prototypesArea(d));
	registerReview(reviewArea(d));
	registerPublishing(publishingArea(d));
	registerAccount(accountArea(d));
	return {
		publish: (force = false) => d.publisher.publish(force),
		open: (root) => d.openRepository(root),
		designRepo: () => d.designRepos.now(),
		setUp: d.setUp,
	};
};
