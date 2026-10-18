import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { Person } from '../src/viewer/Person';
import { render, unmountAll } from './reviewHarness';

/** A person as their picture, on a card in the comments: small by default, the first letter until there is a picture. */

let current: Awaited<ReturnType<typeof render>> | null = null;
afterEach(async () => {
	if (current) await unmountAll(current.root);
	current = null;
});

const avatar = () => document.querySelector('[data-slot="avatar"]') as HTMLElement;

describe('a person', () => {
	it('is the small avatar unless asked for another, named for them, with the first letter of their name until a picture loads', async () => {
		current = await render(createElement(Person, { name: 'noah', src: 'https://avatars.githubusercontent.com/u/1?v=4' }));
		expect(avatar().getAttribute('data-size')).toBe('sm');
		expect(avatar().getAttribute('title')).toBe('noah');
		expect(document.querySelector('[data-slot="avatar-fallback"]')?.textContent).toBe('N');
	});

	it('has the design system’s four sizes', async () => {
		for (const size of ['xs', 'sm', 'md', 'lg'] as const) {
			current = await render(createElement(Person, { name: 'pat', src: null, size }));
			expect(avatar().getAttribute('data-size')).toBe(size);
			await unmountAll(current.root);
			current = null;
		}
	});

	it('is only the letter with no picture', async () => {
		current = await render(createElement(Person, { name: 'pat', src: null }));
		expect(document.querySelector('[data-slot="avatar-image"]')).toBeNull();
		expect(document.querySelector('[data-slot="avatar-fallback"]')?.textContent).toBe('P');
	});
});
