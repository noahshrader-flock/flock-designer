// @vitest-environment jsdom
import { act, createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ComponentCard } from '../src/renderer/ComponentCard';
import { CardSkeleton } from '../src/renderer/Skeletons';
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
const show = async (picture?: string, drawing = false, issues?: { violations: number; incomplete: number }) => {
	current = await render(createElement(ComponentCard, { component: COMPONENT, picture, drawing, issues, onOpen: vi.fn() }));
};
const waiting = () => document.querySelector('[data-picture-waiting]');
afterEach(async () => {
	if (current) await unmountAll(current.root);
	current = null;
});

describe('a component’s card', () => {
	it('names itself in the card name every card uses', async () => {
		await show();
		const name = document.querySelector('[data-slot="card-title"]') as HTMLElement;
		expect(name.textContent).toBe('FSButton');
		expect(name.className.split(' ')).toEqual(expect.arrayContaining(['truncate', 'text-sm', 'font-semibold']));
		expect(name.className.split(' ')).not.toContain('text-base');
		// In a row with its group, it is the one that gives way when the name is long: one line, never a second.
		expect(name.className.split(' ')).not.toContain('shrink-0');
		expect(name.className.split(' ').some((c) => c.startsWith('line-clamp'))).toBe(false);
		// Its group is in the gray the Projects card uses for what a project has.
		expect(document.querySelector('[data-slot="card-footer"]')!.lastElementChild!.className.split(' ')).toEqual(expect.arrayContaining(['text-muted-foreground', 'text-sm']));
	});

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
		// It fills the cover, whole, never cropped or stretched: a picture in any shape fits, on the white the stories are drawn on.
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

describe('while it loads', () => {
	it('is a skeleton the same size: the same cover, and a footer of one row with the same height', async () => {
		current = await render(createElement(ComponentCard, { component: COMPONENT, picture: undefined, onOpen: () => undefined }));
		const real = { cover: document.querySelector('[data-slot="card-cover"]')!.className, footer: document.querySelector('[data-slot="card-footer"]')!.className };
		await unmountAll(current.root);
		current = await render(createElement(CardSkeleton));
		expect(document.querySelector('[data-slot="card-cover"]')!.className).toBe(real.cover);
		expect(document.querySelector('[data-slot="card-footer"]')!.className).toBe(real.footer);
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

describe('a picture on its way', () => {
	it('is a skeleton while a pass is drawing it, and while it loads, and goes once it has loaded', async () => {
		await show(undefined, true);
		expect(waiting()?.getAttribute('data-slot')).toBe('skeleton');
		await unmountAll(current!.root);
		await show('http://127.0.0.1:1/p/a.jpg');
		expect(waiting()).not.toBeNull();
		await act(async () => void (document.querySelector('img') as HTMLImageElement).dispatchEvent(new Event('load')));
		expect(waiting()).toBeNull();
	});

	it('is not waited for when there is none and nothing is drawing, or it would not load: a still placeholder, never a skeleton that does not end', async () => {
		await show();
		expect(waiting()).toBeNull();
		await unmountAll(current!.root);
		await show('http://127.0.0.1:1/p/missing.jpg', true);
		await act(async () => void (document.querySelector('img') as HTMLImageElement).dispatchEvent(new Event('error')));
		expect(waiting()).toBeNull();
	});
});

describe('a component’s accessibility, on its card (T7)', () => {
	it('is a badge with how many issues axe found, and the same words as the panel in the card’s name', async () => {
		await show(undefined, false, { violations: 2, incomplete: 1 });
		const badge = document.querySelector('[data-accessibility-issues]') as HTMLElement;
		expect(badge.textContent).toBe('2');
		expect(badge.title).toBe('2 automated issues, 1 needs a person');
		expect(document.querySelector('[data-component-card]')?.getAttribute('aria-label')).toBe('Open FSButton, 2 automated issues, 1 needs a person');
	});

	it('is nothing when axe found none, or the check has not come back: no result is a pass', async () => {
		await show(undefined, false, { violations: 0, incomplete: 3 });
		expect(document.querySelector('[data-accessibility-issues]')).toBeNull();
		expect(document.querySelector('[data-component-card]')?.getAttribute('aria-label')).toBe('Open FSButton');
		await unmountAll(current!.root);
		await show();
		expect(document.querySelector('[data-accessibility-issues]')).toBeNull();
	});
});
