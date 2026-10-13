// @vitest-environment jsdom
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { Settings } from '../src/renderer/Settings';
import { fakeApp, ok, render, settle, unmountAll } from './reviewHarness';
import { windowSources } from './windowSources';

/**
 * A field is shadcn's, whole: a label that labels its control, a set with a legend for a group of choices, and its lines
 * of description in one size. Held for every screen by reading them, and for Settings by rendering it.
 */

let current: Awaited<ReturnType<typeof render>> | null = null;
afterEach(async () => {
	if (current) await unmountAll(current.root);
	current = null;
});

describe('a label', () => {
	it('is a FieldLabel, and labels a control by its id: none is raw, and none labels nothing', () => {
		const raw = windowSources().filter(({ text }) => /<label\b/.test(text));
		expect(raw.map((f) => f.path)).toEqual([]);
		const pointing = windowSources().flatMap(({ path, text }) =>
			[...text.matchAll(/<FieldLabel\b([^>]*)>/g)].filter((m) => !/htmlFor=/.test(m[1]!)).map(() => path),
		);
		expect(pointing).toEqual([]);
	});
});

describe('a group of choices', () => {
	it('is a set named by its legend: Settings’ theme', async () => {
		(window as unknown as { workspace: unknown }).workspace = fakeApp({ appearance: async () => ok('system') }).api;
		current = await render(createElement(Settings, { open: true, onClose: () => undefined }));
		await settle();
		const set = document.querySelector('fieldset')!;
		expect(set.querySelector('legend')?.textContent).toBe('Theme');
		expect(set.querySelectorAll('[data-slot="toggle-group-item"]')).toHaveLength(3);
	});
});

describe('a field’s description', () => {
	it('is a FieldDescription, the one size, never a line of its own made smaller', () => {
		const own = windowSources().filter(
			// A line of its own in a smaller muted size, whatever the order of its classes, on a screen with fields.
			({ text }) => /<p className="(?=[^"]*\btext-muted-foreground\b)(?=[^"]*\btext-xs\b)[^"]*"/.test(text) && /<Field\b|FieldDescription/.test(text),
		);
		expect(own.map((f) => f.path)).toEqual([]);
	});
});
