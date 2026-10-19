import type { PageStatus } from '../../../shared/contract';
import { prototypeKey } from '../../../shared/designPaths';
import { errorText } from '../../../shared/result';
import { coalescingByKey } from '../platform/concurrency';
import { DESIGN_REPO } from '../../../shared/config';

import type { GitHubAccount } from '../../../codeHost/github';
import { pageStatus, publish, recordsFrom, redeploySite, siteBehind } from './pages';
import { HOST } from '../../../shared/vocabulary';

/**
 * The site's deploys, run by the app in the background: a page it just made (a prototype built, a change Address made),
 * as the agent publishes from Claude Code with the same code; and the site itself when what it is built from changed.
 * What stopped a page is kept, so its screen can say why it is not published.
 */
export const siteDeploys = ({ github, designClone }: { github: Pick<GitHubAccount, 'state' | 'api'>; designClone: () => string | null }) => {
	// One deploy of a page at a time, and once more if asked again meanwhile: what changed since may have missed its push.
	const running = coalescingByKey<string>();
	const stopped = new Map<string, string>();
	const signedIn = () => github.state().state === 'signedIn';

	/** Runs a deploy in the background under `key`. */
	const inBackground = (key: string, deploy: () => Promise<unknown>): void => {
		if (!signedIn()) return;
		void running.run(key, () =>
			deploy()
				.then(() => void stopped.delete(key))
				.catch((err: unknown) => void stopped.set(key, errorText(err))),
		);
	};
	const page = (projectId: string, name: string): void =>
		inBackground(prototypeKey(projectId, name), async () =>
			publish({ github, ref: DESIGN_REPO, ...(await recordsFrom(designClone())), projectId, name }),
		);
	/** The site, when what it is built from changed and no page did: it has no page of its own to key on. */
	const site = (): void => inBackground('the site', async () => redeploySite({ github, ref: DESIGN_REPO, ...(await recordsFrom(designClone())) }));

	/**
	 * Starts a deploy for anything GitHub has that no deploy does (an edit outside a save, a failed deploy, a push from
	 * elsewhere), which nothing else would notice. At most once a minute, and once every ten after a failure, so a missing
	 * permission is not retried on every focus.
	 */
	let lastCatchUp = 0;
	const catchUp = async (): Promise<void> => {
		const gap = stopped.size > 0 ? 10 * 60_000 : 60_000;
		if (!signedIn() || running.size > 0 || Date.now() - lastCatchUp < gap) return;
		lastCatchUp = Date.now();
		try {
			const behind = await siteBehind(github, DESIGN_REPO);
			if (behind?.kind === 'page') page(behind.projectId, behind.name);
			else if (behind?.kind === 'code') site();
		} catch {
			// GitHub would not say: the review screen says so for the page being looked at.
		}
	};

	/** Whether a prototype's page is on the site, publishing, or not, and why when a deploy of it stopped. */
	const status = async (projectId: string, name: string): Promise<PageStatus> => {
		if (!signedIn()) return { state: 'none' };
		const key = prototypeKey(projectId, name);
		if (running.has(key)) return { state: 'publishing' };
		let found: PageStatus;
		try {
			found = await pageStatus(github, DESIGN_REPO, projectId, name);
		} catch (err) {
			// Most often the app's GitHub permission: reading the site and its deploys needs Pages and Deployments.
			return { state: 'unavailable', why: `${HOST} would not say whether this is published: ${errorText(err)}` };
		}
		const why = stopped.get(key);
		return found.state === 'unpublished' && why ? { state: 'unpublished', why } : found;
	};

	return { page, site, catchUp, status };
};
