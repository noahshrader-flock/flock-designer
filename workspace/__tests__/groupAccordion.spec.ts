// @vitest-environment jsdom
import { createElement, useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { GroupTrigger, useClosedGroups } from '../src/renderer/GroupAccordion';
import { Accordion, AccordionContent, AccordionItem } from '../src/renderer/ui/accordion';
import { press, render, unmountAll } from './reviewHarness';

/**
 * What the Design System's components and the tokens panel's tokens share: groups open until they are closed, kept by name,
 * and one header, the name with its count in gray.
 */

let current: Awaited<ReturnType<typeof render>> | null = null;
afterEach(async () => {
	if (current) await unmountAll(current.root);
	current = null;
	document.body.innerHTML = '';
});

/** A list of groups as the screens make one: the names being shown can change, and the list can be made another's. */
const List = () => {
	const [names, setNames] = useState(['a', 'b']);
	const closed = useClosedGroups();
	return createElement(
		'div',
		null,
		createElement('button', { id: 'add', onClick: () => setNames(['a', 'b', 'c']) }, 'add'),
		createElement('button', { id: 'reopen', onClick: () => closed.reopen() }, 'reopen'),
		createElement(
			Accordion,
			closed.accordion(names),
			names.map((n) =>
				createElement(
					AccordionItem,
					{ key: n, value: n },
					createElement(GroupTrigger, { name: n, count: n.length }),
					createElement(AccordionContent, null, `in ${n}`),
				),
			),
		),
	);
};
const trigger = (name: string) =>
	[...document.querySelectorAll<HTMLElement>('[data-slot="accordion-trigger"]')].find((t) => t.querySelector('[data-name]')?.textContent === name)!;
const open = () =>
	[...document.querySelectorAll('[data-slot="accordion-trigger"]')]
		.filter((t) => t.getAttribute('aria-expanded') === 'true')
		.map((t) => t.querySelector('[data-name]')!.textContent);

describe('the groups of a list', () => {
	it('are each a header with its name and, in gray, its count, and are all open at first', async () => {
		current = await render(createElement(List));
		expect(open()).toEqual(['a', 'b']);
		expect(trigger('a').textContent).toBe('a1');
		expect(trigger('a').querySelector('[data-count]')!.className.split(' ')).toContain('text-muted-foreground');
	});

	it('close one at a time, by name, and a group that arrives afterward is open', async () => {
		current = await render(createElement(List));
		await press(trigger('a'));
		expect(open()).toEqual(['b']);
		await press(document.getElementById('add')!);
		expect(open()).toEqual(['b', 'c']);
		await press(trigger('a'));
		expect(open()).toEqual(['a', 'b', 'c']);
	});

	it('are all open again when told to reopen', async () => {
		current = await render(createElement(List));
		await press(trigger('a'));
		await press(trigger('b'));
		expect(open()).toEqual([]);
		await press(document.getElementById('reopen')!);
		expect(open()).toEqual(['a', 'b']);
	});
});
