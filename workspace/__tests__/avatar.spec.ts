import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AVATAR_XS_PX, initialOf, isAvatarUrl } from '../src/shared/avatar';

/** A person, drawn as their picture (the comments' cards and pins). */

describe('the letter that stands in for a picture', () => {
	it('is the first letter of the name, in capitals, whatever the name begins with', () => {
		expect(initialOf('noah')).toBe('N');
		expect(initialOf('  pat brennan')).toBe('P');
		expect(initialOf('élodie')).toBe('É');
		expect(initialOf('😀 smile')).toBe('😀');
	});

	it('is a question mark for no name', () => {
		expect(initialOf('')).toBe('?');
		expect(initialOf('   ')).toBe('?');
	});
});

describe('where a picture may come from', () => {
	it('is the host’s own picture address, and nowhere else, however it is dressed up', () => {
		expect(isAvatarUrl('https://avatars.githubusercontent.com/u/1?v=4')).toBe(true);
		for (const not of [
			'https://evil.example/a.png',
			'javascript:alert(1)',
			'http://avatars.githubusercontent.com/u/1',
			'https://avatars.githubusercontent.com.evil.example/u/1',
			'https://avatars.githubusercontent.com',
			'',
			null,
			undefined,
			42,
		])
			expect(isAvatarUrl(not), String(not)).toBe(false);
	});
});

describe('the avatar sizes', () => {
	const ui = (file: string) => readFileSync(join(__dirname, '..', 'src/renderer/ui', file), 'utf8');

	it('have an extra small one that is a card’s and a pin’s alike: the component’s class and the page’s pixels are one size', () => {
		const rem = /data-\[size=xs\]:size-(\d+)/.exec(ui('avatar.tsx'))?.[1];
		// Tailwind's size-N is N quarters of a rem, a rem being 16px: size-5 is 20px.
		expect(Number(rem) * 4).toBe(AVATAR_XS_PX);
	});

	it('are the buttons’: a small avatar is the small icon button’s width and height, a medium one the icon button’s', () => {
		const buttons = ui('button.tsx');
		const avatar = ui('avatar.tsx');
		const sizeOf = (text: string, pattern: RegExp) => pattern.exec(text)?.[1];
		expect(sizeOf(avatar, /data-\[size=sm\]:(size-\d+)/)).toBe(sizeOf(buttons, /"icon-sm":\s*"(size-\d+)/));
		expect(sizeOf(avatar, /relative flex (size-\d+)/)).toBe(sizeOf(buttons, /\bicon: "(size-\d+)"/));
	});
});
