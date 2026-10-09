// @vitest-environment jsdom
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CancelButton } from '../src/renderer/CancelButton';
import { SyncButton } from '../src/renderer/SyncButton';
import { button, press, render, unmountAll } from './reviewHarness';

/**
 * How two buttons look wherever they appear: every Cancel is a ghost button, and every Sync is an outline one. Each is
 * one component, so the style is set once, and a guard fails if a screen builds a Cancel of its own.
 */

let current: Awaited<ReturnType<typeof render>> | null = null;
afterEach(async () => {
	if (current) await unmountAll(current.root);
	current = null;
});

describe('Cancel', () => {
	it('is a ghost button that says Cancel and does what it is given', async () => {
		const onClick = vi.fn();
		current = await render(createElement(CancelButton, { onClick }));
		expect(button('Cancel').getAttribute('data-variant')).toBe('ghost');
		await press(button('Cancel'));
		expect(onClick).toHaveBeenCalledOnce();
	});

	it('can be disabled', async () => {
		current = await render(createElement(CancelButton, { onClick: () => undefined, disabled: true }));
		expect(button('Cancel').disabled).toBe(true);
	});

	it('is the only place a Cancel button is made: no screen builds its own', () => {
		const files = (dir: string): string[] =>
			readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? files(join(dir, n)) : n.endsWith('.tsx') ? [join(dir, n)] : []));
		const own = ['src/renderer', 'src/viewer']
			.flatMap((d) => files(join(__dirname, '..', d)))
			.filter((f) => !f.endsWith('CancelButton.tsx') && !f.includes(`${join('renderer', 'ui')}`))
			// A line that is only the word Cancel, inside a button.
			.filter((f) => /^\s*Cancel\s*$/m.test(readFileSync(f, 'utf8')));
		expect(own).toEqual([]);
	});
});

describe('Sync', () => {
	it('is an outline button, spinning and disabled while it runs', async () => {
		current = await render(createElement(SyncButton, { syncing: false, onClick: () => undefined }));
		expect(button('Sync').getAttribute('data-variant')).toBe('outline');
		await unmountAll(current.root);
		current = await render(createElement(SyncButton, { syncing: true, onClick: () => undefined }));
		expect(button('Syncing…').getAttribute('data-variant')).toBe('outline');
		expect(button('Syncing…').disabled).toBe(true);
	});
});
