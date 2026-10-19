import { capitalize } from './titleCase';
import { themeOfQuery, withTheme } from './prototypeTheme';
/**
 * A state is opened with `?state=<name>`. The source's `states` list (the first is what it opens in) is copied by the
 * build into a tag the bars read; the page itself never draws a way between them.
 */

export const STATES_META = 'dsnr-states';

/** One lowercase word, so it is short in the bar. */
export const STATE_NAME = /^[a-z0-9]+$/;

export const stateLabel = (name: string): string => capitalize(name);

export const statesOf = (html: string): string[] => {
	const tag = new RegExp(`<meta name="${STATES_META}" content="([^"]*)">`).exec(html);
	const names = tag?.[1]?.split(',') ?? [];
	return names.every((n) => STATE_NAME.test(n)) ? names : [];
};

/**
 * `null` for the state the page opens in, whether named (`?state=default`) or not; any other query (a real app's) is given
 * back as it was. `page/helpers.ts` compares states by the same rule.
 */
export const stateOfQuery = (query: string, states: string[]): string | null => {
	if (query === '') return null;
	const name = /^\?state=([^&]*)$/.exec(query)?.[1];
	if (name === undefined || !STATE_NAME.test(name)) return query;
	return name === states[0] ? null : name;
};

/** `null` is the state it opens in, which is the page's own address. Its theme is kept. */
export const withState = (url: string, state: string | null): string => {
	const [base, query = ''] = url.split('?') as [string, string?];
	return withTheme(state === null ? base : `${base}?state=${state}`, themeOfQuery(`?${query}`));
};
