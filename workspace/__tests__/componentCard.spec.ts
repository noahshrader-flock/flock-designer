// @vitest-environment jsdom
import { act, createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ComponentCard } from '../src/renderer/ComponentCard';
import type { CatalogComponent } from '../src/shared/contract';
import { render, unmountAll } from './reviewHarness';

/** A component's card in the grid view (P5 of the design system plan): its picture, kept steady and faded in. */

const COMPONENT: CatalogComponent = { id: 'src/components/FSButton/FSButton.stories.tsx', name: 'FSButton', group: 'Buttons', subtitle: null, storybook: null, source: '' };
let current: Awaited<ReturnType<typeof render>> | null = null;
const show = async (picture?: string) => {
	current = await render(createElement(ComponentCard, { component: COMPONENT, picture, onOpen: vi.fn() }));
};
afterEach(async () => {
	if (current) await unmountAll(current.root);
	current = null;
});

describe('a component’s card', () => {
	it('is the Projects card: its cover a fixed shape, its footer the name and the group', async () => {
		await show();
		const card = document.querySelector('[data-component-card]') as HTMLElement;
		expect(card.querySelector('[data-slot="card-cover"]')?.className).toContain('aspect-[1920/960]');
		// A soft placeholder until there is a picture.
		expect(card.querySelector('[data-picture-area]')?.className).toContain('bg-muted/40');
		expect(card.textContent).toBe('FSButtonButtons');
		expect(card.getAttribute('role')).toBe('button');
		expect(card.getAttribute('aria-label')).toBe('Open FSButton');
	});

	it('fades its picture in once it has loaded, and gives it no name, since the component’s is beside it', async () => {
		await show('http://127.0.0.1:1/p/a.jpg');
		const img = document.querySelector('img') as HTMLImageElement;
		expect(img.getAttribute('alt')).toBe('');
		// Taken at twice the size it is shown.
		expect(img.getAttribute('srcset')).toBe('http://127.0.0.1:1/p/a.jpg 2x');
		expect(document.querySelector('[data-picture-area]')?.className).toContain('bg-white');
		expect(img.className).toContain('opacity-0');
		expect(img.className).toContain('motion-reduce:transition-none');
		await act(async () => void img.dispatchEvent(new Event('load')));
		expect(img.className).toContain('opacity-100');
	});
});
