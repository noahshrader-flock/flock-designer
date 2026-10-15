import { DEFAULT_THEME, themeOfQuery, type Theme } from '../shared/prototypeTheme';

/**
 * A prototype's page in its theme, run before the prototype's own code: the one its address asks for
 * (`?theme=dark`), else light, the default. Built as the product is, a prototype would follow the machine's light or dark
 * setting: through `matchMedia` (MUI's `useMediaQuery`, in `FSApp`) and through `prefers-color-scheme` rules in its
 * stylesheets (the design system's). Both are answered here with the theme, so every reviewer sees the same page whatever
 * their machine is set to. Only prototypes carry this: codebase work is the real app, and follows what its codebase does.
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

/** Where the page says the theme it was put in, for what records a comment (`page/helpers.ts`). */
export const THEMED = 'data-dsnr-theme';

/** Puts the page in its theme: before the prototype runs, and as its styles arrive. */
export const applyTheme = (win: Window): void => {
	const theme = themeOfQuery(win.location.search) ?? DEFAULT_THEME;
	// Every browser a page is seen in has it; a page without it has nothing that reads it to answer.
	if (typeof win.matchMedia === 'function') {
		const real = win.matchMedia.bind(win);
		win.matchMedia = (query: string) => real(themedQuery(String(query), theme));
	}
	const doc = win.document;
	const all = () => Array.from(doc.styleSheets).forEach((sheet) => themeSheet(sheet, theme));
	new MutationObserver(all).observe(doc, { childList: true, subtree: true });
	doc.addEventListener('DOMContentLoaded', all);
	// The browser's own controls (scroll bars, form fields) in it too.
	doc.documentElement.style.colorScheme = theme;
	doc.documentElement.setAttribute(THEMED, theme);
};

applyTheme(window);
