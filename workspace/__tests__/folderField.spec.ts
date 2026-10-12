// @vitest-environment jsdom
import { createElement, useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { FolderField } from '../src/renderer/FolderField';
import { press, render, settle, typeInto, unmountAll } from './reviewHarness';

/**
 * Choosing a project's folder (F3 of the folders plan), one field for New and for Assign folder: no folder, a folder in
 * use, or a new one, named in an input that opens under the list.
 */

let current: Awaited<ReturnType<typeof render>> | null = null;
let chosen: (string | null | undefined)[] = [];
const Host = ({ first }: { first: string | null }) => {
	const [value, setValue] = useState<string | null | undefined>(first);
	return createElement(FolderField, {
		id: 'f',
		label: 'Folder (optional)',
		folders: ['Admin', 'Roles'],
		value: value ?? null,
		onChange: (v: string | null | undefined) => {
			chosen.push(v);
			setValue(v);
		},
	});
};
const show = async (first: string | null = null) => {
	chosen = [];
	current = await render(createElement(Host, { first }));
};
const list = () => document.getElementById('f') as HTMLElement;
const pick = async (name: string) => {
	await press(list());
	await settle();
	await press([...document.querySelectorAll<HTMLElement>('[cmdk-item]')].find((o) => o.textContent === name) as HTMLElement);
	await settle();
};
const nameInput = () => document.getElementById('f-new') as HTMLInputElement | null;

afterEach(async () => {
	if (current) await unmountAll(current.root);
	current = null;
});

describe('the folder field', () => {
	it('is labelled as it is asked for, and starts on the folder it is given, or no folder', async () => {
		await show('Roles');
		expect(document.querySelector('label[for="f"]')?.textContent).toBe('Folder (optional)');
		expect(list().textContent).toBe('Roles');
		await unmountAll(current!.root);
		await show(null);
		expect(list().textContent).toBe('Choose folder');
	});

	it('lists a way to add a new folder first, then the folders in use, and no folder to choose when it has none', async () => {
		await show();
		await press(list());
		await settle();
		expect([...document.querySelectorAll('[cmdk-item]')].map((o) => o.textContent)).toEqual(['Add new folder', 'Admin', 'Roles']);
	});

	it('offers No folder, last, only while a folder is chosen: the way to clear it', async () => {
		await show('Admin');
		await press(list());
		await settle();
		expect([...document.querySelectorAll('[cmdk-item]')].map((o) => o.textContent)).toEqual(['Add new folder', 'Admin', 'Roles', 'No folder']);
	});

	it('goes back to choosing a folder once No folder is chosen', async () => {
		await show('Admin');
		await pick('No folder');
		expect(list().textContent).toBe('Choose folder');
		expect(chosen).toEqual([null]);
	});

	it('offers a folder with only a way to add one when there are none', async () => {
		chosen = [];
		current = await render(createElement(FolderField, { id: 'f', label: 'Folder', folders: [], value: null, onChange: () => undefined }));
		await press(list());
		await settle();
		expect([...document.querySelectorAll('[cmdk-item]')].map((o) => o.textContent)).toEqual(['Add new folder']);
	});

	it('says which folder is chosen, and none for no folder', async () => {
		await show('Admin');
		await pick('Roles');
		await pick('No folder');
		expect(chosen).toEqual(['Roles', null]);
		expect(nameInput()).toBeNull();
	});

	it('opens an input for the new folder’s name under the list, and says nothing is named until it is', async () => {
		await show('Admin');
		await pick('Add new folder');
		expect(nameInput()).not.toBeNull();
		expect(document.querySelector('label[for="f-new"]')?.textContent).toBe('New folder name');
		expect(chosen).toEqual([undefined]);
		await typeInto(nameInput()!, '  Alerts   area ');
		expect(chosen.at(-1)).toBe('Alerts area');
	});

	it('takes a new name that is a folder in use, ignoring case, for that folder', async () => {
		await show();
		await pick('Add new folder');
		await typeInto(nameInput()!, 'admin');
		expect(chosen.at(-1)).toBe('Admin');
	});

	it('closes the input when a folder in the list is chosen again', async () => {
		await show();
		await pick('Add new folder');
		await pick('Roles');
		expect(nameInput()).toBeNull();
		expect(chosen.at(-1)).toBe('Roles');
	});
});
