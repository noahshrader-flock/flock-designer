import { describe, expect, it } from 'vitest';
import { installStandIns } from '../src/page/standIns';

/**
 * A prototype on the published site is framed with no origin of its own (PUBLISHED_COMMENTS_PLAN, 2.2), where the browser
 * refuses its storage and cookies outright. The page agent gives it stand-ins, in memory, before its own code runs, so a
 * design system that reads them still loads. Only those three, and only where the browser refuses them.
 */

/** A window and document whose storage and cookie the browser refuses, as in a frame with no origin of its own. */
const refusing = () => {
	const refuse = () => {
		throw new DOMException('The document is sandboxed and lacks the "allow-same-origin" flag.', 'SecurityError');
	};
	const win = {};
	for (const name of ['localStorage', 'sessionStorage']) Object.defineProperty(win, name, { get: refuse, configurable: true });
	const doc = {};
	Object.defineProperty(doc, 'cookie', { get: refuse, set: refuse, configurable: true });
	return { win: win as Window, doc: doc as Document };
};

describe('the stand-ins for storage and cookies', () => {
	it('gives a refused localStorage and sessionStorage one each, in memory, that keep and forget like the real ones', () => {
		const { win, doc } = refusing();
		installStandIns(win, doc);
		for (const store of [win.localStorage, win.sessionStorage]) {
			store.setItem('theme', 'dark');
			store.setItem('n', 5 as unknown as string);
			expect(store.getItem('theme')).toBe('dark');
			expect(store.getItem('n')).toBe('5');
			expect(store.getItem('missing')).toBeNull();
			expect(store.length).toBe(2);
			expect(store.key(0)).toBe('theme');
			expect(store.key(9)).toBeNull();
			store.removeItem('theme');
			expect(store.getItem('theme')).toBeNull();
			store.clear();
			expect(store.length).toBe(0);
		}
		// Two stores, not one.
		win.localStorage.setItem('a', '1');
		expect(win.sessionStorage.getItem('a')).toBeNull();
	});

	it('gives a refused cookie a jar that sets, replaces, reads all, and drops one that has expired', () => {
		const { win, doc } = refusing();
		installStandIns(win, doc);
		expect(doc.cookie).toBe('');
		doc.cookie = 'mine=1; path=/; SameSite=Lax';
		doc.cookie = 'theme=dark';
		doc.cookie = 'mine=2';
		expect(doc.cookie).toBe('mine=2; theme=dark');
		doc.cookie = 'theme=; max-age=0';
		expect(doc.cookie).toBe('mine=2');
		doc.cookie = 'mine=x; expires=Thu, 01 Jan 1970 00:00:00 GMT';
		expect(doc.cookie).toBe('');
	});

	it('leaves storage and cookies alone where the browser allows them', () => {
		const real = { getItem: () => 'real' } as unknown as Storage;
		const win = { localStorage: real, sessionStorage: real } as unknown as Window;
		let jar = 'kept=1';
		const doc = {} as Document;
		Object.defineProperty(doc, 'cookie', { get: () => jar, set: (v: string) => void (jar = v), configurable: true });
		installStandIns(win, doc);
		expect(win.localStorage).toBe(real);
		expect(win.sessionStorage).toBe(real);
		expect(doc.cookie).toBe('kept=1');
	});
});
