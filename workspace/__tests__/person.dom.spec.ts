import { act, createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { Avatar } from '../src/ui/Avatar';
import { render, unmountAll } from './ui';

let current: Awaited<ReturnType<typeof render>> | null = null;
afterEach(async () => {
	if (current) await unmountAll(current.root);
	current = null;
});

const avatar = () => document.querySelector('.avatar') as HTMLElement;

describe('a person', () => {
	it('is their picture, named for them as its tooltip, small unless asked for the extra small', async () => {
		current = await render(createElement(Avatar, { name: 'noah', src: 'https://avatars.githubusercontent.com/u/1?v=4' }));
		expect(avatar().getAttribute('title')).toBe('noah');
		expect(avatar().className).toBe('avatar');
		expect(avatar().querySelector('img')?.getAttribute('src')).toBe('https://avatars.githubusercontent.com/u/1?v=4');
		await unmountAll(current.root);
		current = await render(createElement(Avatar, { name: 'noah', src: null, size: 'xs' }));
		expect(avatar().className).toBe('avatar avatar-xs');
	});

	it('is the first letter of their name with no picture, or when it does not load', async () => {
		current = await render(createElement(Avatar, { name: 'pat', src: null }));
		expect(avatar().querySelector('img')).toBeNull();
		expect(avatar().textContent).toBe('P');
		await unmountAll(current.root);
		current = await render(createElement(Avatar, { name: 'pat', src: 'https://avatars.githubusercontent.com/u/2' }));
		await act(async () => void avatar().querySelector('img')!.dispatchEvent(new Event('error')));
		expect(avatar().querySelector('img')).toBeNull();
		expect(avatar().textContent).toBe('P');
	});
});
