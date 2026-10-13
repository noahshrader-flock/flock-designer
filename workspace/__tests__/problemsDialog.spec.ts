// @vitest-environment jsdom
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { ProblemList, ProblemsDialog } from '../src/renderer/ProblemsDialog';
import { button, dialog, press, render, settle, unmountAll } from './reviewHarness';

/**
 * Something wrong, said in one way wherever it is: a small ghost button with the warning icon and what is wrong, and,
 * pressed, a dialog with the same words as its title, a line under it, the details, and one way to close. What is said of
 * tokens that could not be read, of what is not synced, and of a failed update are all this.
 */

let current: Awaited<ReturnType<typeof render>> | null = null;
afterEach(async () => {
	if (current) await unmountAll(current.root);
	current = null;
	document.body.innerHTML = '';
});

const show = async (children = createElement('p', null, 'Details')) => {
	current = await render(createElement(ProblemsDialog, { label: '3 things are wrong', description: 'Skipped, not guessed.', children }));
};

describe('the problems button and its dialog', () => {
	it('is a small ghost button with the warning icon and the words, and nothing open until it is pressed', async () => {
		await show();
		const b = button('3 things are wrong');
		expect([b.getAttribute('data-variant'), b.getAttribute('data-size')]).toEqual(['ghost', 'sm']);
		expect(b.querySelector('svg')).not.toBeNull();
		expect(dialog()).toBeNull();
	});

	it('opens a dialog with the same words as its title, its line under it, and the details', async () => {
		await show();
		await press(button('3 things are wrong'));
		await settle();
		expect(dialog()?.querySelector('[data-slot="dialog-title"]')?.textContent).toBe('3 things are wrong');
		expect(dialog()?.querySelector('[data-slot="dialog-description"]')?.textContent).toBe('Skipped, not guessed.');
		expect(dialog()?.querySelector('[data-slot="dialog-body"]')?.textContent).toBe('Details');
	});

	it('closes from its one Close button, in the footer: not a corner button as well', async () => {
		await show();
		await press(button('3 things are wrong'));
		await settle();
		expect([...(dialog()?.querySelectorAll('button') ?? [])].map((b) => b.textContent)).toEqual(['Close']);
		await press(button('Close', dialog() as HTMLElement));
		await settle();
		expect(dialog()).toBeNull();
	});
});

describe('the details', () => {
	it('are each a title, as words or as a path, why, and the files it is about in a block of their own, one to a line', async () => {
		current = await render(
			createElement(ProblemList, {
				items: [
					{ title: 'Project records', detail: 'Held back.', files: ['a/b.ts', 'c.md'] },
					{ title: 'src/x.ts:4', mono: true, detail: 'Not a literal.' },
					{ detail: 'It failed.' },
				],
			}),
		);
		const items = [...document.querySelectorAll('ul > li')].filter((li) => li.parentElement === document.querySelector('ul'));
		expect(items.map((li) => [...li.children].map((c) => c.textContent))).toEqual([
			['Project records', 'Held back.', 'a/b.tsc.md'],
			['src/x.ts:4', 'Not a literal.'],
			['It failed.'],
		]);
		expect([...items[0]!.querySelectorAll('ul li')].map((li) => li.textContent)).toEqual(['a/b.ts', 'c.md']);
		// A path is in the mono face, a name is not; a thing with no files has no block.
		expect(items[1]!.firstElementChild!.className).toContain('font-mono');
		expect(items[0]!.firstElementChild!.className).not.toContain('font-mono');
		expect(items[1]!.querySelector('ul')).toBeNull();
	});
});
