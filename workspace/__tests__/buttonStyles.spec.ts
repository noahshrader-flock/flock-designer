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

describe('the vertical ellipsis', () => {
	const files = (dir: string): string[] =>
		readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? files(join(dir, n)) : n.endsWith('.tsx') ? [join(dir, n)] : []));

	it('is a ghost button wherever one is drawn: the Button holding the icon says variant="ghost"', () => {
		const wrong: string[] = [];
		for (const f of ['src/renderer', 'src/viewer'].flatMap((d) => files(join(__dirname, '..', d))).filter((p) => !p.includes(join('renderer', 'ui')))) {
			const text = readFileSync(f, 'utf8');
			for (const m of text.matchAll(/<EllipsisVerticalIcon/g)) {
				// The Button that holds it: the last one opened before the icon.
				const button = text.slice(text.lastIndexOf('<Button', m.index), m.index);
				if (!/variant="ghost"/.test(button)) wrong.push(f.replace(`${join(__dirname, '..')}/`, ''));
			}
		}
		expect(wrong).toEqual([]);
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

describe('a button that is always off', () => {
	it('never keeps something to say in its title: a disabled button cannot be hovered, so its title is never shown', () => {
		const files = (dir: string): string[] =>
			readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? files(join(dir, n)) : n.endsWith('.tsx') ? [join(dir, n)] : []));
		/** Each `<Button …>` or `<button …>` opening tag, read to its closing `>` outside any `{…}`. */
		const tags = (text: string): string[] => {
			const found: string[] = [];
			for (const m of text.matchAll(/<(Button|button)\b/g)) {
				let depth = 0;
				for (let i = m.index ?? 0; i < text.length; i++) {
					const c = text[i];
					if (c === '{') depth++;
					else if (c === '}') depth--;
					else if (c === '>' && depth === 0) {
						found.push(text.slice(m.index ?? 0, i + 1));
						break;
					}
				}
			}
			return found;
		};
		const offWithTitle = ['src/renderer', 'src/viewer']
			.flatMap((d) => files(join(__dirname, '..', d)))
			.filter((f) => !f.includes(`${join('renderer', 'ui')}`))
			.flatMap((f) => tags(readFileSync(f, 'utf8')).filter((t) => /\sdisabled(\s|\/?>)/.test(t) && /\stitle=/.test(t)).map((t) => `${f}: ${t.slice(0, 80)}`));
		expect(offWithTitle).toEqual([]);
	});
});

