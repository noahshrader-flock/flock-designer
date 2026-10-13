// @vitest-environment jsdom
import { act, createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { closeUnlessBusy } from '../src/renderer/dialogClose';
import { ErrorAlert } from '../src/renderer/ErrorAlert';
import { Alert } from '../src/renderer/ui/alert';
import { render, unmountAll } from './reviewHarness';
import { Dialog, DialogContent, DialogTitle } from '../src/renderer/ui/dialog';
import { TooltipProvider } from '../src/renderer/ui/tooltip';
import { badTags, offenders, windowSources } from './windowSources';

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
		expect(windowSources().length).toBeGreaterThan(50);
		// A dialog the screen opens closes through closeUnlessBusy; one that keeps its own open state hands it setOpen.
		expect(badTags(/^(Dialog|Sheet)$/, (tag) => /onOpenChange=/.test(tag) && !/onOpenChange=\{(closeUnlessBusy\(|setOpen\})/.test(tag))).toEqual([]);
	});
});

describe('a dialog’s body', () => {
	it('is laid out by DialogBody, so no dialog gives it the same column again', () => {
		expect(offenders(/<DialogBody className="flex flex-col/)).toEqual([]);
	});
});

describe('Done', () => {
	it('is a filled button wherever a dialog ends with it', () => {
		expect(badTags(/^Button$/, (tag, after) => /^\s*Done\s*</.test(after) && /variant="(outline|secondary|ghost)"/.test(tag))).toEqual([]);
	});
});

describe('choosing a repository', () => {
	it('is one field wherever it is asked (New, Connect): no screen builds its own list of repositories', () => {
		expect(offenders(/Search repositories…/, 'RepositoryField.tsx')).toEqual([]);
	});
});

describe('a dialog that is working', () => {
	it('stays open on Escape while it works, and closes on it after', async () => {
		const onClose = vi.fn();
		const show = (busy: boolean) =>
			createElement(
				Dialog,
				{ open: true, onOpenChange: closeUnlessBusy(onClose, busy) },
				createElement(DialogContent, null, createElement(DialogTitle, null, 'Assign folder')),
			);
		// Radix listens for Escape on the document, where a key pressed in the dialog arrives.
		const escape = () => act(async () => void document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
		current = await render(show(true));
		await escape();
		expect(onClose).not.toHaveBeenCalled();
		await act(async () => current!.root.render(createElement(TooltipProvider, null, show(false))));
		await escape();
		expect(onClose).toHaveBeenCalledOnce();
	});
});
