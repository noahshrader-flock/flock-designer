// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { applyTheme, themedQuery } from '../src/page/theme';
import { pageState, pageTheme } from '../src/page/helpers';

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

	it('opens a prototype in light when no theme is asked for, whatever the machine is set to (its default)', () => {
		document.documentElement.style.colorScheme = '';
		const { win, asked } = fakeWindow('?state=panel');
		applyTheme(win);
		expect(win.matchMedia('(prefers-color-scheme: dark)').matches).toBe(false);
		expect(win.matchMedia('(prefers-color-scheme: light)').matches).toBe(true);
		expect(asked).toEqual(['(max-width: -1px)', '(min-width: 0px)']);
		expect(document.documentElement.style.colorScheme).toBe('light');
	});
});

describe('what a comment records of the page', () => {
	it('is its state without the theme, so one comment is on the same state in either theme', () => {
		history.replaceState(null, '', '/demo/v1/?state=panel&theme=dark');
		expect(pageState()).toBe('?state=panel');
		history.replaceState(null, '', '/demo/v1/?theme=light');
		expect(pageState()).toBe('');
	});

	it('is the theme a prototype opened in; a page DSNR did not theme (codebase work: the real app) is the system’s', () => {
		history.replaceState(null, '', '/demo/v1/?theme=dark');
		applyTheme(window);
		expect(pageTheme()).toBe('dark');
		history.replaceState(null, '', '/demo/v1/');
		applyTheme(window);
		expect(pageTheme()).toBe('light');
		// The real app's preview has no theme put on it, so it follows what it was seen in.
		document.documentElement.removeAttribute('data-dsnr-theme');
		expect(pageTheme()).toBe('light');
	});
});
