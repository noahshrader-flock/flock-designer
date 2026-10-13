// @vitest-environment jsdom
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { closeUnlessBusy } from '../src/renderer/dialogClose';
import { ErrorAlert } from '../src/renderer/ErrorAlert';
import { Alert } from '../src/renderer/ui/alert';
import { render, unmountAll } from './reviewHarness';
import { windowSources } from './windowSources';

/**
 * Dialogs and what goes wrong in them, said one way on every screen: an error is one `ErrorAlert`, which wraps a long git
 * or `gh` message instead of letting it run off the side; a dialog its screen opens closes through `closeUnlessBusy`,
 * never while it is working; a dialog's body is laid out by `DialogBody` itself; and Done is a filled button.
 */

let current: Awaited<ReturnType<typeof render>> | null = null;
afterEach(async () => {
	if (current) await unmountAll(current.root);
	current = null;
});

describe('an error', () => {
	it('is a destructive alert whose text wraps, however long its words are', async () => {
		current = await render(createElement(ErrorAlert, { error: 'fatal: unable to access https://github.com/flocksafety/a-very-long-name/' }));
		const alert = document.querySelector('[data-slot="alert"]')!;
		// The stock destructive alert's own classes: shadcn's Alert does not mark its variant otherwise.
		const reference = await render(createElement(Alert, { variant: 'destructive' }));
		expect(alert.className).toBe(reference.host.querySelector('[data-slot="alert"]')!.className);
		await unmountAll(reference.root);
		const text = alert.querySelector('[data-slot="alert-description"]')!;
		expect(text.textContent).toContain('fatal: unable to access');
		expect(text.className.split(' ')).toEqual(expect.arrayContaining(['wrap-anywhere', 'whitespace-pre-wrap']));
	});

	it('is never built by hand: a destructive alert with only its text is an ErrorAlert', () => {
		const own = windowSources('ErrorAlert.tsx').filter(({ text }) =>
			/<Alert variant="destructive"[^>]*>\s*<AlertDescription[^>]*>\{[^}]+\}<\/AlertDescription>\s*<\/Alert>/.test(text),
		);
		expect(own.map((f) => f.path)).toEqual([]);
	});
});

describe('closing a dialog', () => {
	it('closes when asked, and not while it is working', () => {
		const onClose = vi.fn();
		closeUnlessBusy(onClose, true)(false);
		expect(onClose).not.toHaveBeenCalled();
		closeUnlessBusy(onClose)(true);
		expect(onClose).not.toHaveBeenCalled();
		closeUnlessBusy(onClose)(false);
		expect(onClose).toHaveBeenCalledOnce();
	});

	it('is one way on every dialog or sheet a screen opens: none writes its own', () => {
		const sources = windowSources();
		expect(sources.length).toBeGreaterThan(50);
		const own = sources.filter(({ text }) => /<(Dialog|Sheet)\b[^>]*onOpenChange=\{\(\w+\) =>/.test(text)).map((f) => f.path);
		expect(own).toEqual([]);
	});
});

describe('a dialog’s body', () => {
	it('is laid out by DialogBody, so no dialog gives it the same column again', () => {
		const own = windowSources().filter(({ text }) => /<DialogBody className="flex flex-col/.test(text));
		expect(own.map((f) => f.path)).toEqual([]);
	});
});

describe('Done', () => {
	it('is a filled button wherever a dialog ends with it', () => {
		const own = windowSources().filter(({ text }) => /<Button variant="(outline|secondary|ghost)"[^>]*>\s*Done\s*</.test(text));
		expect(own.map((f) => f.path)).toEqual([]);
	});
});
