import type { Checkout } from '../shared/contract';
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
 * Every operation the window can reach, and nothing else, registered by area (`calls/`). There is no generic invoke and no
 * passthrough: each handler is named, its arguments checked (`handle.ts`), its root resolved against what the person
 * actually opened, and its answer returned as a Result.
 */
export const registerCalls = (
	context: CallsContext,
): {
	publish: (force?: boolean) => Promise<void>;
	/**
	 * Opens and trusts a product checkout: the shell's own way, for the folder the person opened in it (an editor's trusted
	 * workspace folder). Never reachable from a page: no call opens a checkout.
	 */
	open: (root: string) => Promise<Checkout>;
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
	return { publish: (force = false) => d.publisher.publish(force), open: (root) => d.openRepository(root) };
};
