// @vitest-environment jsdom
import { act, createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { CommentControl } from '../src/renderer/comments/CommentControl';
import { MoreMenu } from '../src/renderer/MoreMenu';
import { usePublishStatus } from '../src/renderer/PublishStatus';
import { ResizablePanel } from '../src/renderer/ResizablePanel';
import { COMMENTS_PANEL } from '../src/renderer/panelWidth';
import { Alert } from '../src/renderer/ui/alert';
import { DropdownMenuItem } from '../src/renderer/ui/dropdown-menu';
import type { PublishStatus } from '../src/shared/contract';
import { button, fakeApp, ok, probeHook, render, settle, unmountAll } from './reviewHarness';
import { badTags, offenders, windowSources } from './windowSources';

/** What assistive technology is told: only what it needs, assertively only when something went wrong. */

let current: Awaited<ReturnType<typeof render>> | null = null;
afterEach(async () => {
	if (current) await unmountAll(current.root);
	current = null;
});

describe('an alert', () => {
	it('interrupts only when something went wrong: a notice, a warning or a success is a status', async () => {
		current = await render(
			createElement(
				'div',
				null,
				...(['default', 'warning', 'success', 'destructive'] as const).map((variant) =>
					createElement(Alert, { key: variant, variant, 'data-v': variant } as never),
				),
			),
		);
		expect([...current.host.querySelectorAll('[data-slot="alert"]')].map((a) => [a.getAttribute('data-v'), a.getAttribute('role')])).toEqual([
			['default', 'status'],
			['warning', 'status'],
			['success', 'status'],
			['destructive', 'alert'],
		]);
	});
});

describe('a button that is working', () => {
	it('is named by the button, not also by a spinner inside it that says Loading', async () => {
		current = await render(createElement(MoreMenu, { busy: true, children: createElement(DropdownMenuItem, null, 'x') }));
		expect(button('More').querySelector('[role="status"]:not([aria-hidden="true"])')).toBeNull();
	});

	it('nowhere has a spinner left to say Loading inside it', () => {
		expect(badTags(/^Button$/, (_tag, after) => /^\s*(?:\{[^<]*)?<Spinner(?![^>]*aria-hidden)/.test(after))).toEqual([]);
	});
});

describe('the comments button', () => {
	it('says how many comments there are in its name, not only in its picture', async () => {
		const comments = { commentMode: false, total: 3, toggleCommentMode: () => undefined } as never;
		current = await render(createElement(CommentControl, { comments, listOpen: false, onToggleList: () => undefined, disabled: false }));
		expect(button(/^Show all comments/).getAttribute('aria-label')).toBe('Show all comments (3)');
	});
});

describe('the divider of a panel', () => {
	it('says how wide it can be, as well as how wide it is', async () => {
		current = await render(createElement(ResizablePanel, { panel: COMMENTS_PANEL, label: 'Resize', children: 'x' }));
		const divider = current.host.querySelector('[role="separator"]')!;
		expect(Number(divider.getAttribute('aria-valuemin'))).toBeGreaterThan(0);
		expect(Number(divider.getAttribute('aria-valuemax'))).toBeGreaterThan(Number(divider.getAttribute('aria-valuemin')));
	});
});

describe('the account’s picture', () => {
	it('says nothing, since the name is beside it', () => {
		expect(offenders(/<AvatarImage\b[^>]*alt=\{/)).toEqual([]);
	});
});

describe('what is not synced', () => {
	it('is kept by the hook through a sync that runs, so nothing is written while drawing', async () => {
		let push: (s: PublishStatus) => void = () => undefined;
		(window as unknown as { workspace: unknown }).workspace = fakeApp({
			publishStatus: async () => ok({ state: 'unavailable' }),
			onPublishStatus: (l: (s: PublishStatus) => void) => {
				push = l;
				return () => undefined;
			},
		}).api;
		const probe = await probeHook(() => usePublishStatus()[0]);
		current = probe;
		await settle();
		const held: PublishStatus = { state: 'held', at: 'x', problems: [{ what: 'Project records', why: 'y' }] };
		await act(async () => push(held));
		await act(async () => push({ state: 'working' }));
		expect(probe.now()).toEqual(held);
		await act(async () => push({ state: 'shared', at: 'z' }));
		expect(probe.now()).toEqual({ state: 'shared', at: 'z' });
	});

	it('is shown by a button that keeps nothing of its own: what it shows is the hook’s', () => {
		expect(windowSources().find((f) => f.path.endsWith('PublishStatus.tsx'))!.text).not.toMatch(/useRef/);
	});
});
