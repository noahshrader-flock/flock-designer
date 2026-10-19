import { act, createElement, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Badge } from '../src/ui/Badge';
import { ColorDot } from '../src/ui/ColorDot';
import { Icon } from '../src/ui/Icon';
import { Button } from '../src/ui/Button';
import { IconButton } from '../src/ui/IconButton';
import { Menu } from '../src/ui/Menu';
import { Message } from '../src/ui/Message';
import { Dialog, DialogButtons } from '../src/ui/Dialog';
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

	it('puts the focus on the dialog itself, not a control, when it is a few controls for one thing, as a popover does (focus="panel")', async () => {
		// Opened from a button of its own, closed by its own onClose, so what is given back to the button is the dialog's doing.
		const Opened = () => {
			const [shown, setShown] = useState(false);
			return createElement(
				'div',
				null,
				createElement('button', { type: 'button', onClick: () => setShown(true) }, 'Change Radius base'),
				shown &&
					createElement(
						Dialog as never,
						{ title: 'Radius base', onClose: () => setShown(false), focus: 'panel' },
						createElement('input', { type: 'range', 'aria-label': 'Radius', defaultValue: 8 }),
						createElement('button', { type: 'button' }, 'Reset'),
					),
			);
		};
		await mount(createElement(Opened));
		const opener = button('Change Radius base');
		opener.focus();
		await press(opener);
		const box = document.querySelector('[role="dialog"]') as HTMLElement;
		// On the dialog: the keyboard is in it, and no slider is drawn as chosen the moment it opens.
		expect(document.activeElement).toBe(box);
		expect(box.getAttribute('tabindex')).toBe('-1');
		// Tab and Shift+Tab stay inside it, back from the dialog itself going to its last control.
		const key = (name: string, shiftKey = false) =>
			act(async () => void box.dispatchEvent(new KeyboardEvent('keydown', { key: name, shiftKey, bubbles: true, cancelable: true })));
		await key('Tab', true);
		expect(document.activeElement?.textContent).toBe('Reset');
		// Closed with Escape, the focus goes back to what opened it, as every dialog's does.
		await key('Escape');
		expect(document.querySelector('[role="dialog"]')).toBeNull();
		expect(document.activeElement).toBe(opener);
	});

	it('closes on Escape only once what opened over it has: a menu in it closes first, then the dialog', async () => {
		const onClose = vi.fn();
		await open(
			createElement(Menu, { label: 'Account actions', sections: [{ items: [{ label: 'Sign out', icon: 'sign-out', onSelect: () => undefined }] }] }),
			onClose,
		);
		const opener = document.querySelector('[aria-label="Account actions"]') as HTMLElement;
		await press(opener);
		expect(document.querySelector('[role="menu"]')).not.toBeNull();
		const escape = () =>
			act(async () => void document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
		await escape();
		expect(document.querySelector('[role="menu"]')).toBeNull();
		expect(onClose).not.toHaveBeenCalled();
		expect(document.activeElement).toBe(opener);
		await escape();
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it('goes through its links too, by Tab, and keeps Tab inside it: from its X to a link, from the last link back to the X', async () => {
		const box = await open(
			createElement(
				'p',
				null,
				createElement('a', { href: 'https://example.test/a' }, 'First'),
				' ',
				createElement('a', { href: 'https://example.test/b' }, 'Second'),
			),
		);
		const key = (shiftKey = false) =>
			act(
				async () =>
					void document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true })),
			);
		// It opens on the X (the first thing in it); Shift+Tab from it is the last link, not out of the dialog.
		expect(document.activeElement).toBe(close());
		await key(true);
		expect(document.activeElement?.textContent).toBe('Second');
		// Tab from the last link comes round to the X; the browser's own Tab does the ones between.
		await key();
		expect(document.activeElement).toBe(close());
		expect(box.contains(document.activeElement)).toBe(true);
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

describe('a message as a page (an empty state)', () => {
	it('is one thing everywhere: the icon, the heading, the words, then the button, in a column to be centered', async () => {
		await mount(
			createElement(Message, {
				size: 'page',
				icon: 'symbol-color',
				title: 'No design system found',
				children: [createElement('p', { key: 'p' }, 'Look here.'), createElement(Button, { key: 'b', children: 'Locate' })],
			}),
		);
		const content = document.querySelector('.empty > .empty-content') as HTMLElement;
		expect([...content.children].map((c) => c.className)).toEqual(['empty-icon', 'empty-title', 'empty-body']);
		expect(content.querySelector('.empty-icon .codicon-symbol-color')).not.toBeNull();
		expect(content.querySelector('[data-part="title"]')?.textContent).toBe('No design system found');
		expect([...content.querySelectorAll('.empty-body > *')].map((c) => c.tagName)).toEqual(['P', 'BUTTON']);
	});
});

describe('the blank badge', () => {
	it('is the badge extra small with no number, named by its label, and sits where its parent puts it', async () => {
		await mount(createElement(Badge, { tone: 'warning', label: 'Contrast is too low', className: 'color-dot-flag' }));
		const dot = document.querySelector('[aria-label="Contrast is too low"]') as HTMLElement;
		expect(dot.className).toBe('badge badge-warning badge-xs color-dot-flag');
		expect(dot.getAttribute('role')).toBe('img');
		expect(dot.textContent).toBe('');
	});
});

/** A color is only its dot, wherever it is something to press: the one piece the grid of roles, Values and a token's row share. */
describe('the color dot', () => {
	const dot = () => document.querySelector('.color-dot') as HTMLElement;

	it('is a button named for what it changes, saying what it is on hover and to assistive technology, that opens its control when pressed', async () => {
		const onPress = vi.fn();
		await mount(createElement(ColorDot, { value: '#108062', says: 'Light primary main', name: 'Light primary main', onPress }));
		expect(dot().tagName).toBe('BUTTON');
		expect(dot().getAttribute('aria-label')).toBe('Change Light primary main');
		expect(dot().title).toBe('Light primary main');
		// Its tooltip is its name, so it is not said a second time as its description.
		expect(dot().hasAttribute('aria-description')).toBe(false);
		expect((dot().querySelector('[data-swatch]') as HTMLElement).style.backgroundColor).toBe('rgb(16, 128, 98)');
		// Nothing else of the color is written: no name, no hex.
		expect(dot().textContent).toBe('');
		await press(dot());
		expect(onPress).toHaveBeenCalledTimes(1);
		// A tooltip that says more than its name (the token a value is) is its description.
		document.body.innerHTML = '';
		await mount(createElement(ColorDot, { value: '#108062', says: 'primary.main', name: 'Background', onPress }));
		expect(dot().getAttribute('aria-description')).toBe('primary.main');
	});

	it('is the same dot with nothing to press when it has no control, said as an image by its name and the token it is', async () => {
		await mount(createElement(ColorDot, { value: '#108062', says: 'Light primary main', name: 'Background · primary' }));
		expect(dot().tagName).toBe('SPAN');
		expect(dot().getAttribute('role')).toBe('img');
		expect(dot().getAttribute('aria-label')).toBe('Background · primary: Light primary main');
		expect(dot().title).toBe('Light primary main');
	});

	it('has no tooltip when it is no token, said by its name alone, whether it has a control or not', async () => {
		await mount(createElement(ColorDot, { value: '#108062', name: 'Background', onPress: () => undefined }));
		expect(dot().hasAttribute('title')).toBe(false);
		expect(dot().hasAttribute('aria-description')).toBe(false);
		expect(dot().getAttribute('aria-label')).toBe('Change Background');
		document.body.innerHTML = '';
		await mount(createElement(ColorDot, { value: '#108062', name: 'Background' }));
		expect(dot().hasAttribute('title')).toBe(false);
		expect(dot().getAttribute('aria-label')).toBe('Background');
	});

	it('says whether the popover it opens is open, only when it opens one', async () => {
		await mount(createElement(ColorDot, { value: '#000000', name: 'Border', onPress: () => undefined, popup: { open: true } }));
		expect([dot().getAttribute('aria-haspopup'), dot().getAttribute('aria-expanded')]).toEqual(['dialog', 'true']);
		document.body.innerHTML = '';
		await mount(createElement(ColorDot, { value: '#000000', name: 'Border', onPress: () => undefined }));
		expect(dot().hasAttribute('aria-haspopup')).toBe(false);
		expect(dot().hasAttribute('aria-expanded')).toBe(false);
	});

	it('is marked when changed or tried, and flagged when its contrast is low, each said by its words, and neither otherwise', async () => {
		await mount(
			createElement(ColorDot, {
				value: '#000000',
				name: 'Text',
				onPress: () => undefined,
				mark: 'Tried',
				flag: 'Contrast is too low',
			}),
		);
		// A button's name is all that is read of what is inside it: the mark and the flag are said as its description.
		expect(dot().getAttribute('aria-description')).toBe('Tried, Contrast is too low');
		expect(dot().querySelector('[data-changed-mark]')?.getAttribute('aria-hidden')).toBe('true');
		expect(dot().querySelector('.badge-warning')?.getAttribute('aria-hidden')).toBe('true');
		document.body.innerHTML = '';
		await mount(createElement(ColorDot, { value: '#000000', name: 'Text', onPress: () => undefined }));
		expect(dot().querySelector('[data-changed-mark], .badge')).toBeNull();
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
