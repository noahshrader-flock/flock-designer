import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { Button } from '../extension/webview/ui/Button';
import { IconButton } from '../extension/webview/ui/IconButton';
import { Menu } from '../extension/webview/ui/Menu';
import { DialogButtons } from '../extension/webview/ui/Dialog';
import { button, mount } from './webviewHarness';

/** DSNR's three buttons in VS Code: the primary in its brand, the secondary outlined, and the ghost for a way out. */
describe('the panel’s buttons', () => {
	it('are primary unless said otherwise, and draw each kind by its own class', async () => {
		await mount(
			createElement('div', null, [
				createElement(Button, { key: 'p', children: 'Create' }),
				createElement(Button, { key: 's', variant: 'secondary', children: 'Source' }),
				createElement(Button, { key: 'g', variant: 'ghost', children: 'Start over' }),
			]),
		);
		expect(button('Create').className).toBe('button button-primary');
		expect(button('Source').className).toBe('button button-secondary');
		expect(button('Start over').className).toBe('button button-ghost');
	});

	it('give a dialog’s way out the ghost, beside what it does; a dialog that only says something closes with the secondary', async () => {
		await mount(
			createElement('div', null, [
				createElement(DialogButtons, { key: 'a', onClose: () => undefined, close: 'Cancel' }, createElement(Button, { children: 'Assign' })),
				createElement(DialogButtons, { key: 'b', onClose: () => undefined }),
			]),
		);
		expect(button('Cancel').className).toBe('button button-ghost');
		expect(button('Assign').className).toBe('button button-primary');
		expect(button('Close').className).toBe('button button-secondary');
	});
});

describe('icon buttons and menus', () => {
	it('are the default size, the search’s, unless a row or a header makes them small', async () => {
		await mount(
			createElement('div', null, [
				createElement(IconButton, { key: 'a', icon: 'refresh', label: 'Default', onClick: () => undefined }),
				createElement(IconButton, { key: 'b', icon: 'refresh', label: 'Small', size: 'small', onClick: () => undefined }),
				createElement(Menu, { key: 'c', label: 'Menu default', sections: [{ items: [] }] }),
				createElement(Menu, { key: 'd', label: 'Menu small', size: 'small', sections: [{ items: [] }] }),
			]),
		);
		const classOf = (label: string) => document.querySelector(`[aria-label="${label}"]`)?.className;
		expect(classOf('Default')).toBe('icon-button');
		expect(classOf('Small')).toBe('icon-button icon-button-small');
		expect(classOf('Menu default')).toBe('menu-button');
		expect(classOf('Menu small')).toBe('menu-button menu-button-small');
	});
});
