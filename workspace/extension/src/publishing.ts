import type { PublishStatus, WorkspaceApi } from '../../src/shared/contract';
import { valueOf } from '../../src/shared/result';
import type { Review } from './messages';

/**
 * Whether the person's work is synced, as VS Code's status bar says it (ELECTRON_MIGRATION_PLAN 4.3): it syncs by
 * itself, so this only reports. Nothing when there is nothing to sync from here.
 */
export const syncItem = (status: PublishStatus): { text: string; tooltip: string } | null => {
	switch (status.state) {
		case 'unavailable':
			return null;
		case 'working':
			return { text: '$(sync~spin) Syncing', tooltip: 'DSNR is syncing your work.' };
		case 'shared':
			return { text: '$(cloud) Synced', tooltip: 'Your work is synced.' };
		case 'held':
			return { text: '$(warning) Not synced', tooltip: 'Some work isn’t synced: click to see why.' };
	}
};

/** What the status bar's item offers: what is held back, each with why and its files, then Sync now. */
export const syncPicks = (status: PublishStatus): { label: string; detail?: string; value: 'sync' | null }[] => [
	...(status.state === 'held'
		? status.problems.map((p) => ({ label: `$(warning) ${p.what}`, detail: [p.why, ...(p.files ?? [])].join(' '), value: null }))
		: []),
	{ label: '$(sync) Sync now', value: 'sync' as const },
];

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
		choose: (message: string, actions: string[]) => Promise<string | undefined>;
		tell: (message: string) => void;
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
