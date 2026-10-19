import { describe, expect, it } from 'vitest';
import { DEFAULT_THEME, isTheme, themeOfQuery, withTheme, withoutTheme } from '../src/shared/prototypeTheme';
import { withState } from '../src/shared/prototypeStates';

/** The theme rides in the address beside the state, and is never part of what tells one state from another. */

describe('the theme an address asks for', () => {
	it('is light or dark, and nothing else; with none, the system’s', () => {
		expect(themeOfQuery('?theme=dark')).toBe('dark');
		expect(themeOfQuery('?state=panel&theme=light')).toBe('light');
		for (const none of ['', '?state=panel', '?theme=', '?theme=blue', '?theme=DARK']) expect(themeOfQuery(none)).toBeNull();
		expect([isTheme('light'), isTheme('dark'), isTheme('system'), isTheme(undefined)]).toEqual([true, true, false, false]);
	});
});

describe('an address in a theme', () => {
	it('adds, replaces and takes off the theme, keeping the state', () => {
		expect(withTheme('page.html', 'dark')).toBe('page.html?theme=dark');
		expect(withTheme('page.html?state=panel', 'dark')).toBe('page.html?state=panel&theme=dark');
		// Light is the prototype's default, so its address does not say it: one address per page and theme.
		expect(DEFAULT_THEME).toBe('light');
		expect(withTheme('page.html?state=panel&theme=dark', 'light')).toBe('page.html?state=panel');
		expect(withTheme('page.html', 'light')).toBe('page.html');
		expect(withTheme('page.html?state=panel&theme=dark', null)).toBe('page.html?state=panel');
		expect(withTheme('page.html?theme=dark', null)).toBe('page.html');
	});

	it('keeps its theme when its state changes', () => {
		expect(withState('page.html?theme=dark', 'panel')).toBe('page.html?state=panel&theme=dark');
		expect(withState('page.html?state=panel&theme=dark', null)).toBe('page.html?theme=dark');
		expect(withState('page.html?state=panel&theme=dark', 'filtered')).toBe('page.html?state=filtered&theme=dark');
	});
});

describe('a query without its theme', () => {
	it('is the query as it was, so a comment’s state is the same in either theme', () => {
		expect(withoutTheme('?state=panel&theme=dark')).toBe('?state=panel');
		expect(withoutTheme('?theme=dark&state=panel')).toBe('?state=panel');
		expect(withoutTheme('?theme=light')).toBe('');
		// Left exactly as it was when there is no theme in it: a real app's query keeps its own spelling.
		for (const q of ['', '?state=panel', '?tab=usage&q=a%20b', '?x=1+2']) expect(withoutTheme(q)).toBe(q);
	});
});
