/**
 * A prototype opens in light whatever the machine is set to, so every reviewer first sees the same page; dark is
 * `?theme=dark`. A comment's state is its query without the theme.
 */

export const THEMES = ['light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];

export const isTheme = (v: unknown): v is Theme => v === 'light' || v === 'dark';

export const DEFAULT_THEME: Theme = 'light';

export const themeLabel = (theme: Theme): string => (theme === 'dark' ? 'Dark' : 'Light');

const KEY = 'theme';
const parts = (query: string): string[] => query.replace(/^\?/, '').split('&').filter(Boolean);
const ofKey = (part: string): boolean => part === KEY || part.startsWith(`${KEY}=`);

export const themeOfQuery = (query: string): Theme | null => {
	const asked = parts(query)
		.find(ofKey)
		?.slice(KEY.length + 1);
	return isTheme(asked) ? asked : null;
};

/** A query with no theme in it is given back exactly as it was, so a real app's query keeps its spelling. */
export const withoutTheme = (query: string): string => {
	if (!parts(query).some(ofKey)) return query;
	const rest = parts(query).filter((p) => !ofKey(p));
	return rest.length > 0 ? `?${rest.join('&')}` : '';
};

/** The default theme is not said, so there is one address per page and theme. */
export const withTheme = (url: string, theme: Theme | null): string => {
	const at = url.indexOf('?');
	const base = at === -1 ? url : url.slice(0, at);
	const rest = parts(at === -1 ? '' : url.slice(at)).filter((p) => !ofKey(p));
	const all = theme === null || theme === DEFAULT_THEME ? rest : [...rest, `${KEY}=${theme}`];
	return all.length > 0 ? `${base}?${all.join('&')}` : base;
};
