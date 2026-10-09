/**
 * A prototype's states: the ways one page can be seen (`default`, `no-match`, `panel`…), each opened by asking for the
 * page with `?state=<name>`. The prototype says which it has, as `export const states = ['default', …]` in its source,
 * the first being what it opens in; the build copies that list into the page as a tag, and the review screen and the
 * published page read it from there, to offer them in their bar. The page itself never draws a way between them.
 */

/** The tag the build writes the list into. */
export const STATES_META = 'flkd-states';

/** What a state may be called, in the address and in the source. */
export const STATE_NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** The states a built page has, from its tag; none when it has no tag, or one that is not a list of names. */
export const statesOf = (html: string): string[] => {
	const tag = new RegExp(`<meta name="${STATES_META}" content="([^"]*)">`).exec(html);
	const names = tag?.[1]?.split(',') ?? [];
	return names.every((n) => STATE_NAME.test(n)) ? names : [];
};

/** The page's address in a state; `null` is the one it opens in, which is the page's own address. */
export const withState = (url: string, state: string | null): string => {
	const [base] = url.split('?') as [string];
	return state === null ? base : `${base}?state=${state}`;
};
