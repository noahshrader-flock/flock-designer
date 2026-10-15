import { themeOfQuery, type Theme } from '../shared/prototypeTheme';

/**
 * The page in the theme its address asks for (`?theme=light|dark`, PROTOTYPE_THEME_PLAN), run before the prototype's own code.
 * A prototype follows the system's light or dark setting, as the product does: through `matchMedia` (MUI's `useMediaQuery`, in
 * `FSApp`) and through `prefers-color-scheme` rules in its stylesheets (the design system's). Both are answered here with the
 * chosen theme, so a person sees the theme they chose whatever their machine is set to. With none asked for, nothing is changed.
 */

const SCHEME = /\(\s*prefers-color-scheme\s*:\s*(light|dark)\s*\)/gi;
/** Media queries a browser always, and never, matches: what a light-or-dark part becomes. */
const ALWAYS = '(min-width: 0px)';
const NEVER = '(max-width: -1px)';

/** A media query with its light-or-dark part answered for `theme`; the rest of it is left to the browser. */
export const themedQuery = (query: string, theme: Theme): string =>
	query.replace(SCHEME, (_whole, scheme: string) => (scheme.toLowerCase() === theme ? ALWAYS : NEVER));

/** A stylesheet's light-or-dark rules answered for `theme`, in nested rules too. One that cannot be read is left alone. */
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

/** Puts the page in the theme its address asks for, if it asks for one: before the prototype runs, and as its styles arrive. */
export const applyTheme = (win: Window): void => {
	const theme = themeOfQuery(win.location.search);
	if (theme === null) return;
	const real = win.matchMedia.bind(win);
	win.matchMedia = (query: string) => real(themedQuery(String(query), theme));
	const doc = win.document;
	const all = () => Array.from(doc.styleSheets).forEach((sheet) => themeSheet(sheet, theme));
	new MutationObserver(all).observe(doc, { childList: true, subtree: true });
	doc.addEventListener('DOMContentLoaded', all);
	// The browser's own controls (scroll bars, form fields) in it too.
	doc.documentElement.style.colorScheme = theme;
};

applyTheme(window);
