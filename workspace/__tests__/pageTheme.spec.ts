// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { applyTheme, themedQuery } from '../src/page/theme';
import { pageState, pageTheme } from '../src/page/helpers';

/** The page's own part (`src/page/theme.ts`): run first in a page, it answers the page's light-or-dark question from `?theme=`. */

describe('a media query in a chosen theme', () => {
	it('answers its light-or-dark part with the chosen theme, leaving the rest of it to the browser', () => {
		expect(themedQuery('(prefers-color-scheme: dark)', 'dark')).toBe('(min-width: 0px)');
		expect(themedQuery('(prefers-color-scheme: dark)', 'light')).toBe('(max-width: -1px)');
		expect(themedQuery('screen and (prefers-color-scheme:light)', 'light')).toBe('screen and (min-width: 0px)');
		expect(themedQuery('(PREFERS-COLOR-SCHEME: Dark), (min-width: 900px)', 'light')).toBe('(max-width: -1px), (min-width: 900px)');
		expect(themedQuery('(min-width: 600px)', 'dark')).toBe('(min-width: 600px)');
	});
});

describe('the page in a chosen theme', () => {
	const fakeWindow = (search: string) => {
		const asked: string[] = [];
		const win = {
			location: { search },
			matchMedia: (q: string) => {
				asked.push(q);
				return { matches: q === '(min-width: 0px)', media: q } as MediaQueryList;
			},
			document,
		};
		return { win: win as unknown as Window, asked };
	};

	it('answers matchMedia in the chosen theme, and says the theme to the browser’s own controls', () => {
		const { win, asked } = fakeWindow('?state=panel&theme=dark');
		applyTheme(win);
		expect(win.matchMedia('(prefers-color-scheme: dark)').matches).toBe(true);
		expect(win.matchMedia('(prefers-color-scheme: light)').matches).toBe(false);
		expect(asked).toEqual(['(min-width: 0px)', '(max-width: -1px)']);
		expect(document.documentElement.style.colorScheme).toBe('dark');
	});

	it('leaves the page to follow the system, as the product does, when no theme is asked for', () => {
		document.documentElement.style.colorScheme = '';
		const { win } = fakeWindow('?state=panel');
		const before = win.matchMedia;
		applyTheme(win);
		expect(win.matchMedia).toBe(before);
		expect(document.documentElement.style.colorScheme).toBe('');
	});
});

describe('what a comment records of the page', () => {
	it('is its state without the theme, so one comment is on the same state in either theme, and the theme on its own', () => {
		history.replaceState(null, '', '/demo/v1-i1/?state=panel&theme=dark');
		expect(pageState()).toBe('?state=panel');
		expect(pageTheme()).toBe('dark');
		history.replaceState(null, '', '/demo/v1-i1/?theme=light');
		expect(pageState()).toBe('');
		expect(pageTheme()).toBe('light');
		// Asked for none: the system's (light, where nothing says dark).
		history.replaceState(null, '', '/demo/v1-i1/');
		expect(pageTheme()).toBe('light');
	});
});
