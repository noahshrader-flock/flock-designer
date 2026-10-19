import { DEFAULT_THEME, themeOfQuery, type Theme } from '../shared/prototypeTheme';

/**
 * Runs before the prototype's own code. `matchMedia` and `prefers-color-scheme` rules are answered with the address's
 * theme, so every reviewer sees the same page whatever their machine is set to.
 */

const SCHEME = /\(\s*prefers-color-scheme\s*:\s*(light|dark)\s*\)/gi;
/** Media queries a browser always, and never, matches. */
const ALWAYS = '(min-width: 0px)';
const NEVER = '(max-width: -1px)';

export const themedQuery = (query: string, theme: Theme): string =>
	query.replace(SCHEME, (_whole, scheme: string) => (scheme.toLowerCase() === theme ? ALWAYS : NEVER));

// A cross-origin sheet's rules cannot be read, so it is left alone.
const themeSheet = (sheet: CSSStyleSheet | CSSGroupingRule, theme: Theme): void => {
	let rules: CSSRuleList;
	try {
		rules = sheet.cssRules;
	} catch {
		return;
	}
	for (const rule of Array.from(rules)) {
		const media = (rule as CSSMediaRule).media;
		if (media && /prefers-color-scheme/i.test(media.mediaText)) media.mediaText = themedQuery(media.mediaText, theme);
		if ((rule as CSSGroupingRule).cssRules) themeSheet(rule as CSSGroupingRule, theme);
	}
};

export const THEMED = 'data-dsnr-theme';

export const applyTheme = (win: Window): void => {
	const theme = themeOfQuery(win.location.search) ?? DEFAULT_THEME;
	if (typeof win.matchMedia === 'function') {
		const real = win.matchMedia.bind(win);
		win.matchMedia = (query: string) => real(themedQuery(String(query), theme));
	}
	const doc = win.document;
	const all = () => Array.from(doc.styleSheets).forEach((sheet) => themeSheet(sheet, theme));
	// Also catches rules a CSS-in-JS library inserts as a story draws.
	new MutationObserver(all).observe(doc, { childList: true, subtree: true });
	doc.addEventListener('DOMContentLoaded', all);
	// For the browser's own controls (scroll bars, form fields).
	doc.documentElement.style.colorScheme = theme;
	doc.documentElement.setAttribute(THEMED, theme);
};

applyTheme(window);
