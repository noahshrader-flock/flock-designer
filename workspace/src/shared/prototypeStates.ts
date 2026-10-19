import { capitalize } from './titleCase';
import { themeOfQuery, withTheme } from './prototypeTheme';
/**
 * A prototype's states: the ways one page can be seen (`default`, `filtered`, `panel`…), each opened with `?state=<name>`.
 * Its source lists them (`export const states = ['default', …]`, the first is what it opens in); the build copies that
 * into a tag, and the bars offer them from there. The page itself never draws a way between them.
 */

/** The tag the build writes the list into. */
export const STATES_META = 'dsnr-states';

/** What a state may be called, in the address and in the source: one lowercase word, so it is short in the bar. */
export const STATE_NAME = /^[a-z0-9]+$/;

/** How a state is shown, in the bar and on a comment: its name with a capital. The name itself stays as it is. */
export const stateLabel = (name: string): string => capitalize(name);

/** The states a built page has, from its tag; none when it has no tag, or one that is not a list of names. */
export const statesOf = (html: string): string[] => {
	const tag = new RegExp(`<meta name="${STATES_META}" content="([^"]*)">`).exec(html);
	const names = tag?.[1]?.split(',') ?? [];
	return names.every((n) => STATE_NAME.test(n)) ? names : [];
};

/**
 * The state a comment was made in, from the query it recorded (`anchor.state`): the state's name, or `null` for the one
 * the page opens in, whether named (`?state=default`) or not. Anything else (a real app's query) is given back as it was;
 * the page scripts compare states by the same rule (`page/helpers.ts`).
 */
export const stateOfQuery = (query: string, states: string[]): string | null => {
	if (query === '') return null;
	const name = /^\?state=([^&]*)$/.exec(query)?.[1];
	if (name === undefined || !STATE_NAME.test(name)) return query;
	return name === states[0] ? null : name;
};

/** The page's address in a state; `null` is the one it opens in, which is the page's own address. Its theme is kept. */
export const withState = (url: string, state: string | null): string => {
	const [base, query = ''] = url.split('?') as [string, string?];
	return withTheme(state === null ? base : `${base}?state=${state}`, themeOfQuery(`?${query}`));
};
