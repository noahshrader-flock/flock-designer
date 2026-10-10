// @vitest-environment jsdom
import { act, createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ComponentCard } from '../src/renderer/ComponentCard';
import type { CatalogComponent } from '../src/shared/contract';
import { render, unmountAll } from './reviewHarness';

/** A component's card in the grid view (P5 of the design system plan): its picture, kept steady and faded in. */

const COMPONENT: CatalogComponent = {
	id: 'src/components/FSButton/FSButton.stories.tsx',
	name: 'FSButton',
	group: 'Buttons',
	subtitle: null,
	storybook: null,
	source: '',
};
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
		const cover = card.querySelector('[data-slot="card-cover"]') as HTMLElement;
		expect(cover.className).toContain('aspect-[1920/960]');
		// Nothing around the picture: no padding on the cover, and no box inside it.
		expect(cover.className).not.toMatch(/\bp[xytrbl]?-/);
		expect(cover.className).toContain('overflow-hidden');
		// The card's gap under its cover is run through, so no band of the card's color shows between a picture and its footer.
		expect(cover.className).toContain('mb-[calc(var(--card-spacing)*-1)]');
		// A soft placeholder until there is a picture, filling the cover.
		expect(card.querySelector('[data-picture-area]')?.className.split(' ')).toEqual(expect.arrayContaining(['bg-muted/40', 'absolute', 'inset-0']));
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
		// It fills the cover, edge to edge: nothing is left around it to be seen.
		// Whole, never cropped or stretched: a picture in any shape fits, on the white the stories are drawn on.
		expect(img.className.split(' ')).toEqual(expect.arrayContaining(['size-full', 'object-contain']));
		expect(img.className).not.toContain('object-cover');
		expect(img.className).toContain('opacity-0');
		expect(img.className).toContain('motion-reduce:transition-none');
		await act(async () => void img.dispatchEvent(new Event('load')));
		expect(img.className).toContain('opacity-100');
		// White behind it once it is there, as the stories are drawn on white; the placeholder's gray until then.
		expect(document.querySelector('[data-picture-area]')?.className).toContain('bg-white');
	});
});

describe('how the pictures are taken', () => {
	it('is a fingerprint of the code that takes them, so a change to it makes the old pictures no picture', async () => {
		const { PICTURE_RECIPE } = await import('../src/main/services/storyMeasure');
		expect(PICTURE_RECIPE).toMatch(/^[0-9a-f]{12}$/);
	});
});

describe('what the app window lets a picture load from', () => {
	it('lets the pictures load from the app’s local server, as the preview frames do, and from nowhere else new', async () => {
		const { readFileSync } = await import('node:fs');
		const { join } = await import('node:path');
		const page = readFileSync(join(__dirname, '../src/renderer/index.html'), 'utf8');
		const policy = /Content-Security-Policy"\s+content="([^"]+)"/.exec(page)?.[1] ?? '';
		const imgSrc =
			policy
				.split(';')
				.map((d) => d.trim())
				.find((d) => d.startsWith('img-src')) ?? '';
		expect(imgSrc.split(/\s+/)).toEqual(['img-src', "'self'", 'data:', 'https://avatars.githubusercontent.com', 'http://127.0.0.1:*']);
	});
});

describe('a picture that does not load', () => {
	it('leaves the soft placeholder, never a white block', async () => {
		await show('http://127.0.0.1:1/p/missing.jpg');
		await act(async () => void (document.querySelector('img') as HTMLImageElement).dispatchEvent(new Event('error')));
		expect(document.querySelector('img')).toBeNull();
		expect(document.querySelector('[data-picture-area]')?.className).toContain('bg-muted/40');
	});
});
