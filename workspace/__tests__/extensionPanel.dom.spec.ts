import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Panel } from '../extension/webview/Panel';

/**
 * DSGN's panel (Phase 0.4 and 0.5): the Projects and Design System toggle at its very top, which the person moves with a
 * click or the arrow keys, and which keeps its choice when the panel reloads (VS Code's webview state).
 */

let state: unknown;
let root: Root | null = null;
beforeEach(() => {
	state = undefined;
	(globalThis as { acquireVsCodeApi?: unknown }).acquireVsCodeApi = () => ({
		getState: () => state,
		setState: (next: unknown) => (state = next),
		postMessage: () => undefined,
	});
});
afterEach(async () => {
	await act(async () => root?.unmount());
	root = null;
	document.body.innerHTML = '';
});

const show = async () => {
	const host = document.body.appendChild(document.createElement('div'));
	root = createRoot(host);
	await act(async () => root?.render(createElement(Panel)));
};
const toggle = () => document.querySelector('[role="radiogroup"]') as HTMLElement;
const options = () => [...toggle().querySelectorAll<HTMLElement>('[role="radio"]')];
const chosen = () => options().find((o) => o.getAttribute('aria-checked') === 'true')?.textContent;
const body = () => document.querySelector('[data-tab-body]')?.getAttribute('data-tab-body');
const key = async (el: HTMLElement, name: string) =>
	act(async () => void el.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true })));

describe('the toggle at the top', () => {
	it('is first in the panel, Projects and Design System, with Projects chosen', async () => {
		await show();
		expect(document.querySelector('main')?.firstElementChild).toBe(toggle());
		expect(toggle().getAttribute('aria-label')).toBe('View');
		expect(options().map((o) => o.textContent)).toEqual(['Projects', 'Design System']);
		expect(chosen()).toBe('Projects');
		expect(body()).toBe('projects');
	});

	it('switches what is under it when the other is pressed', async () => {
		await show();
		await act(async () => options()[1]!.click());
		expect(chosen()).toBe('Design System');
		expect(body()).toBe('design-system');
	});

	it('moves with the arrow keys, Home and End, and only the chosen one is in the tab order', async () => {
		await show();
		expect(options().map((o) => o.tabIndex)).toEqual([0, -1]);
		await key(options()[0]!, 'ArrowRight');
		expect(chosen()).toBe('Design System');
		expect(document.activeElement).toBe(options()[1]);
		await key(options()[1]!, 'ArrowRight');
		expect(chosen()).toBe('Projects'); // it wraps
		await key(options()[0]!, 'End');
		expect(chosen()).toBe('Design System');
		await key(options()[1]!, 'Home');
		expect(chosen()).toBe('Projects');
		expect(options().map((o) => o.tabIndex)).toEqual([0, -1]);
	});

	it('keeps its choice when the panel reloads', async () => {
		await show();
		await act(async () => options()[1]!.click());
		await act(async () => root?.unmount());
		document.body.innerHTML = '';
		await show();
		expect(chosen()).toBe('Design System');
	});

	it('draws its icons from VS Code’s own codicons', async () => {
		await show();
		expect(options().map((o) => o.querySelector('.codicon')?.className)).toEqual(['codicon codicon-folder-library', 'codicon codicon-symbol-color']);
		expect(options().every((o) => o.querySelector('.codicon')?.getAttribute('aria-hidden') === 'true')).toBe(true);
	});
});

describe('Projects', () => {
	const rows = () => [...document.querySelectorAll<HTMLElement>('[data-tab-body="projects"] [role="listitem"]')];
	const part = (row: HTMLElement, name: string) => row.querySelector(`[data-part="${name}"]`)?.textContent ?? null;

	it('lists each project as a row: a picture, its name, what it has, and its open comments as a badge', async () => {
		await show();
		expect(document.querySelector('[data-tab-body="projects"] [role="list"]')?.getAttribute('aria-label')).toBe('Projects');
		expect(rows().map((r) => part(r, 'name'))).toEqual(['Alert history', 'Admin usage', 'Role comparison', 'Zone coverage']);
		const first = rows()[0] as HTMLElement;
		expect(first.querySelector('[data-part="picture"]')).not.toBeNull();
		expect(part(first, 'meta')).toBe('3 iterations · Admin');
		expect(part(rows()[2] as HTMLElement, 'meta')).toBe('1 iteration');
	});

	it('shows the open comments only when there are some, and says what the number is', async () => {
		await show();
		const badges = rows().map((r) => r.querySelector('.badge'));
		expect(badges.map((b) => b?.textContent ?? null)).toEqual(['2', null, '5', null]);
		expect(badges[0]?.getAttribute('aria-label')).toBe('2 open comments');
	});
});
