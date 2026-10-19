import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AVATAR_XS_PX, initialOf, isAvatarUrl } from '../src/shared/avatar';

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
	const kit = readFileSync(join(__dirname, '..', 'src/ui/kit.css'), 'utf8');

	it('have an extra small one that is a card’s and a pin’s alike: the kit’s size and the page’s pixels are one', () => {
		expect(/--dsnr-avatar-xs:\s*(\d+)px;/.exec(kit)?.[1]).toBe(String(AVATAR_XS_PX));
	});

	it('are a small control’s otherwise, as the small buttons are', () => {
		const avatar = /^\.avatar \{([^}]*)\}/m.exec(kit)?.[1] ?? '';
		expect(avatar).toMatch(/width:\s*var\(--dsnr-control-small\)/);
		expect(avatar).toMatch(/height:\s*var\(--dsnr-control-small\)/);
	});
});
