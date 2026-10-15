import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Badge } from '../extension/webview/ui/Badge';
import { Icon } from '../extension/webview/ui/Icon';
import { Button } from '../extension/webview/ui/Button';
import { IconButton } from '../extension/webview/ui/IconButton';
import { Menu } from '../extension/webview/ui/Menu';
import { Dialog, DialogButtons } from '../extension/webview/ui/Dialog';
import { button, mount, press } from './webviewHarness';

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

	it('hold only what a dialog does, in a row, and nothing when it does nothing: the way out is the X in its title, not a Cancel or a Close', async () => {
		await mount(
			createElement('div', null, [
				createElement(DialogButtons, { key: 'a' }, createElement(Button, { children: 'Assign' })),
				createElement(DialogButtons, { key: 'b' }),
			]),
		);
		expect(button('Assign').className).toBe('button button-primary');
		expect(document.querySelectorAll('.dialog-buttons')).toHaveLength(1);
		expect([...document.querySelectorAll('.dialog-buttons button')].map((b) => b.textContent)).toEqual(['Assign']);
	});
});

describe('a dialog', () => {
	const open = async (children: unknown, onClose = () => undefined) => {
		await mount(createElement(Dialog as never, { title: 'GitHub account', onClose }, children as never));
		return document.querySelector('[role="dialog"]') as HTMLElement;
	};
	const close = () => document.querySelector<HTMLButtonElement>('[role="dialog"] [aria-label="Close"]') as HTMLButtonElement;

	it('has its close X in the row of its title, at the far right, and closes with it', async () => {
		const onClose = vi.fn();
		const box = await open(createElement('p', null, 'Signed in.'), onClose);
		const head = box.querySelector('.dialog-head') as HTMLElement;
		expect([...head.children].map((c) => c.tagName + (c.className ? `.${c.className.split(' ')[0]}` : ''))).toEqual([
			'H2.dialog-title',
			'BUTTON.icon-button',
		]);
		expect(close().title).toBe('Close');
		await press(close());
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it('puts the focus on its first field, never on the X it opens with', async () => {
		await open(createElement('input', { 'aria-label': 'Name' }));
		expect(document.activeElement?.getAttribute('aria-label')).toBe('Name');
	});

	it('puts the focus on what it does when it has no field', async () => {
		await open(createElement('button', { type: 'button' }, 'Sign out'));
		expect(document.activeElement?.textContent).toBe('Sign out');
	});

	it('has only the X to reach when it has nothing else in it', async () => {
		await open(createElement('p', null, 'Only words.'));
		expect(document.activeElement).toBe(close());
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

describe('the badge', () => {
	it('is VS Code’s own colours unless it is a tone: the brand’s for a count of comments, the warning’s for what is wrong', async () => {
		await mount(
			createElement('div', null, [
				createElement(Badge, { key: 'a', count: 2, label: 'violations' }),
				createElement(Badge, { key: 'b', count: 3, label: 'comments', tone: 'brand' }),
				createElement(Badge, { key: 'c', count: 1, label: 'not read', tone: 'warning' }),
			]),
		);
		const classOf = (label: string) => document.querySelector(`[aria-label="${label}"]`)?.className;
		expect(classOf('violations')).toBe('badge');
		expect(classOf('comments')).toBe('badge badge-brand');
		expect(classOf('not read')).toBe('badge badge-warning');
	});

	it('is a button, named and with a tooltip, when it opens something', async () => {
		const pressed = vi.fn();
		await mount(createElement(Badge, { count: 3, label: '3 values are not read', tone: 'warning', onPress: pressed }));
		const badge = document.querySelector('button[aria-label="3 values are not read"]') as HTMLButtonElement;
		expect(badge.textContent).toBe('3');
		expect(badge.title).toBe('3 values are not read');
		expect(badge.className).toBe('badge badge-warning badge-button');
		await press(badge);
		expect(pressed).toHaveBeenCalledTimes(1);
	});
});

describe('the icon', () => {
	it('is the codicon at its size, or extra small beside a line of text', async () => {
		await mount(
			createElement('div', null, [
				createElement(Icon, { key: 'a', name: 'git-branch' }),
				createElement(Icon, { key: 'b', name: 'git-branch', size: 'xs' }),
			]),
		);
		expect([...document.querySelectorAll('.codicon')].map((i) => i.className)).toEqual([
			'codicon codicon-git-branch',
			'codicon codicon-git-branch icon-xs',
		]);
	});
});
