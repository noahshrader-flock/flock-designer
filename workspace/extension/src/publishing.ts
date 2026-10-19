import type { PublishStatus, WorkspaceApi } from '../../src/shared/contract';
import { valueOf } from '../../src/shared/result';
import type { Offer, Tell } from './agentWork';
import type { Review } from './messages';

/** Whether the person's work is synced, in a sentence: said by the status bar's tooltip and by the sync dialog in the panel. */
export const syncWords = (status: PublishStatus): string => {
	switch (status.state) {
		case 'unavailable':
			return 'Nothing to sync from here: no product and design repository are open side by side.';
		case 'working':
			return 'DSNR is syncing your work.';
		case 'shared':
			return 'Your work is synced.';
		case 'held':
			return 'Some work isn’t synced.';
	}
};

/**
 * Whether the person's work is synced, as VS Code's status bar says it: it syncs by
 * itself, so this only reports; pressed, it opens the sync dialog in the panel. Nothing when there is nothing to sync from here.
 */
export const syncItem = (status: PublishStatus): { text: string; tooltip: string } | null => {
	switch (status.state) {
		case 'unavailable':
			return null;
		case 'working':
			return { text: '$(sync~spin) Syncing', tooltip: syncWords(status) };
		case 'shared':
			return { text: '$(cloud) Synced', tooltip: syncWords(status) };
		case 'held':
			return { text: '$(warning) Not synced', tooltip: `${syncWords(status).slice(0, -1)}: click to see why.` };
	}
};

const PUBLISH = 'Publish';

/**
 * A review's page on the published site: its link once it is there, to open or to share. Otherwise said: on its way;
 * saved but not there (with why, and Publish); or why it cannot be told. Null when there is no link yet.
 */
export const publishedLink = async (
	{
		api,
		choose,
		tell,
	}: {
		api: Pick<WorkspaceApi, 'publishedPage' | 'publishPage'>;
		choose: Offer;
		tell: Tell;
	},
	{ projectId, name, title }: Review,
): Promise<string | null> => {
	const status = valueOf(await api.publishedPage(projectId, name));
	switch (status.state) {
		case 'published':
			return status.url;
		case 'publishing':
			tell(`${title} is being published: its page is ready in a minute or two.`);
			return null;
		case 'unpublished':
			if ((await choose(`${title} is not on its page yet${status.why ? `: ${status.why}` : '.'}`, [PUBLISH])) === PUBLISH) {
				valueOf(await api.publishPage(projectId, name));
				tell(`Publishing ${title}: its page is ready in a minute or two.`);
			}
			return null;
		case 'unavailable':
			throw new Error(`Whether ${title} is on its page cannot be told: ${status.why}`);
		case 'none':
			throw new Error('The design repository has no published site.');
	}
};
