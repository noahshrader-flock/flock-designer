/**
 * A prototype seen in light or dark, whatever the machine it is seen on is set to (PROTOTYPE_THEME_PLAN). With none chosen
 * it follows the system, as the product does (`FSApp` with no prop). The theme rides in the page's address as `?theme=`,
 * beside its state, and the page answers its own light-or-dark question from it (`page/theme.ts`). It is never part of what
 * tells one state from another: a comment's state is its query without the theme (`withoutTheme`).
 */

export const THEMES = ['light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];

export const isTheme = (v: unknown): v is Theme => v === 'light' || v === 'dark';

/** How a theme is named, in the bar and on a comment's card. */
export const themeLabel = (theme: Theme): string => (theme === 'dark' ? 'Dark' : 'Light');

const KEY = 'theme';
const parts = (query: string): string[] => query.replace(/^\?/, '').split('&').filter(Boolean);
const ofKey = (part: string): boolean => part === KEY || part.startsWith(`${KEY}=`);

/** The theme a query asks for, or null for the system's. */
export const themeOfQuery = (query: string): Theme | null => {
	const asked = parts(query)
		.find(ofKey)
		?.slice(KEY.length + 1);
	return isTheme(asked) ? asked : null;
};

/** A query without its theme. One with no theme in it is given back exactly as it was, so a real app's query keeps its spelling. */
export const withoutTheme = (query: string): string => {
	if (!parts(query).some(ofKey)) return query;
	const rest = parts(query).filter((p) => !ofKey(p));
	return rest.length > 0 ? `?${rest.join('&')}` : '';
};

/** The address in a theme, the rest of its query kept, the theme last; `null` is the system's. */
export const withTheme = (url: string, theme: Theme | null): string => {
	const at = url.indexOf('?');
	const base = at === -1 ? url : url.slice(0, at);
	const rest = parts(at === -1 ? '' : url.slice(at)).filter((p) => !ofKey(p));
	const all = theme === null ? rest : [...rest, `${KEY}=${theme}`];
	return all.length > 0 ? `${base}?${all.join('&')}` : base;
};
