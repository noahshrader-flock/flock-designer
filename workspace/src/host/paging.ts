import { asArray } from '../shared/json';
import type { GitHubApi } from './designRepo';
import { HOST } from '../shared/vocabulary';

/**
 * Every item of a list the host pages, 100 at a time, read up to the first page that is not full. A first version read
 * one page and stopped, so the 101st comment on a thread never appeared.
 *
 * `together`: after a full first page, the rest are asked for at once, for a list where each call can take a second or
 * more (through the command line, a process each). `atMost`: what reaching `maxPages` of full pages means, a failure said
 * aloud (`fail`, for a list that must be whole) or the list as far as it was read (`stop`, for one that is a choice).
 */
export const readPages = async (
	github: GitHubApi,
	path: string,
	{ maxPages, together = false, atMost = 'fail' }: { maxPages: number; together?: boolean; atMost?: 'fail' | 'stop' },
): Promise<unknown[]> => {
	const page = async (n: number) => asArray(await github.api(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${n}`));
	const items: unknown[] = [];
	const take = (batch: unknown[]): boolean => (items.push(...batch), batch.length === 100);
	if (together) {
		if (!take(await page(1))) return items;
		// Taken in order, up to the first short one: what comes after it is not part of the list.
		if (!(await Promise.all(Array.from({ length: maxPages - 1 }, (_, i) => page(i + 2)))).every(take)) return items;
	} else {
		for (let n = 1; n <= maxPages; n++) if (!take(await page(n))) return items;
	}
	if (atMost === 'fail') throw tooMany(maxPages);
	return items;
};

const tooMany = (maxPages: number) => new Error(`There are more than ${maxPages * 100} of these on ${HOST}, which is more than this app reads.`);
