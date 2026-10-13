import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ViewSwitcher, useRememberedView } from '../src/renderer/ViewSwitcher';
import { press, render, settle, unmountAll } from './reviewHarness';

/**
 * List or Grid, as one button group with the shown one pressed, and the choice remembered for the screen that asked: the
 * same piece on the Projects screen and the Design System tab, each with its own memory.
 */

let current: Awaited<ReturnType<typeof render>> | null = null;
afterEach(async () => {
	if (current) await unmountAll(current.root);
	current = null;
	document.body.innerHTML = '';
	localStorage.clear();
});

const button = (name: 'List' | 'Grid') => document.querySelector<HTMLElement>(`[aria-label="View"] [aria-label="${name}"]`)!;
const shown = () => document.querySelector('[aria-label="View"] [aria-checked="true"]')?.getAttribute('aria-label');

describe('ViewSwitcher', () => {
	it('is List and Grid in one group named View, with the shown one pressed', async () => {
		current = await render(createElement(ViewSwitcher, { view: 'grid', onSelect: vi.fn() }));
		expect([...document.querySelectorAll('[aria-label="View"] button')].map((b) => b.getAttribute('aria-label'))).toEqual(['List', 'Grid']);
		expect(shown()).toBe('Grid');
	});

	it('says which one was pressed, and says nothing when the one shown is pressed again, so one is always pressed', async () => {
		const onSelect = vi.fn();
		current = await render(createElement(ViewSwitcher, { view: 'list', onSelect }));
		await press(button('List'));
		expect(onSelect).not.toHaveBeenCalled();
		await press(button('Grid'));
		expect(onSelect).toHaveBeenCalledExactlyOnceWith('grid');
	});
});

describe('useRememberedView', () => {
	/** A screen that shows its view as text and has a way to choose the other. */
	const Screen = ({ id, first }: { id: string; first?: 'list' | 'grid' }) => {
		const [view, choose] = useRememberedView(id, first);
		return createElement('button', { 'data-screen': id, onClick: () => choose(view === 'list' ? 'grid' : 'list') }, view);
	};
	const screen = (id: string) => document.querySelector<HTMLElement>(`[data-screen="${id}"]`)!;

	it('is a list at first, and a list for anything it was left that is not a view', async () => {
		current = await render(createElement(Screen, { id: 'dsnr.a' }));
		expect(screen('dsnr.a').textContent).toBe('list');
		await unmountAll(current.root);
		localStorage.setItem('dsnr.a', 'carousel');
		current = await render(createElement(Screen, { id: 'dsnr.a' }));
		expect(screen('dsnr.a').textContent).toBe('list');
	});

	it('starts in the view the screen asks for, and what was chosen before still wins over it', async () => {
		current = await render(createElement(Screen, { id: 'dsnr.a', first: 'grid' }));
		expect(screen('dsnr.a').textContent).toBe('grid');
		await unmountAll(current.root);
		localStorage.setItem('dsnr.a', 'list');
		current = await render(createElement(Screen, { id: 'dsnr.a', first: 'grid' }));
		expect(screen('dsnr.a').textContent).toBe('list');
	});

	it('keeps the choice, and gives it back the next time the screen is opened', async () => {
		current = await render(createElement(Screen, { id: 'dsnr.a' }));
		await press(screen('dsnr.a'));
		await settle();
		expect(screen('dsnr.a').textContent).toBe('grid');
		expect(localStorage.getItem('dsnr.a')).toBe('grid');
		await unmountAll(current.root);
		current = await render(createElement(Screen, { id: 'dsnr.a' }));
		expect(screen('dsnr.a').textContent).toBe('grid');
	});

	it('is remembered for each screen on its own: one screen’s choice never changes another’s', async () => {
		localStorage.setItem('dsnr.a', 'grid');
		current = await render(createElement('div', null, createElement(Screen, { id: 'dsnr.a' }), createElement(Screen, { id: 'dsnr.b' })));
		expect(screen('dsnr.a').textContent).toBe('grid');
		expect(screen('dsnr.b').textContent).toBe('list');
		await press(screen('dsnr.b'));
		expect(localStorage.getItem('dsnr.a')).toBe('grid');
		expect(localStorage.getItem('dsnr.b')).toBe('grid');
	});
});
