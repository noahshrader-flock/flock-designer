import type { PublishStatus, WorkspaceApi } from '../../src/shared/contract';
import { valueOf } from '../../src/shared/result';
import type { Offer, Tell } from './say';
import type { Review } from './messages';

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

/** The review's published link, or null after telling the person why there is none yet. */
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
	{ prototypeId, name, title }: Review,
): Promise<string | null> => {
	const status = valueOf(await api.publishedPage(prototypeId, name));
	switch (status.state) {
		case 'published':
			return status.url;
		case 'publishing':
			tell(`${title} is being published: its page is ready in a minute or two.`);
			return null;
		case 'unpublished':
			if ((await choose(`${title} is not on its page yet${status.why ? `: ${status.why}` : '.'}`, [PUBLISH])) === PUBLISH) {
				valueOf(await api.publishPage(prototypeId, name));
				tell(`Publishing ${title}: its page is ready in a minute or two.`);
			}
			return null;
		case 'unavailable':
			throw new Error(`Whether ${title} is on its page cannot be told: ${status.why}`);
		case 'none':
			throw new Error('The design repository has no published site.');
	}
};
