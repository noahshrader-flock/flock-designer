import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PreviewStatus } from '../src/renderer/review/PreviewStatus';
import { button, press, render, unmountAll } from './reviewHarness';

/**
 * What the review screen says before a page opens, one state at a time, in shadcn's empty state: what is happening as
 * its title and a line under it, the agent's log, and what can be done.
 */

let current: Awaited<ReturnType<typeof render>> | null = null;
afterEach(async () => {
	if (current) await unmountAll(current.root);
	current = null;
});

const editor = { available: true, editor: true, session: true, openInEditor: vi.fn(async () => null), continueInClaude: vi.fn(async () => null) };
const props = (more: Record<string, unknown> = {}) => ({
	project: { id: 'demo', title: 'Alert history' },
	iteration: { name: 'v1-i1', branch: 'feature/alert-history', previewUrl: null },
	prototype: false,
	checkout: { root: '/c', name: 'flock-coke', branch: 'develop', clean: true },
	phase: { kind: 'agent' },
	log: ['Reading AlertHistory.tsx'],
	editor,
	error: null,
	handedOff: null,
	onHandedOff: () => undefined,
	handoffReady: null,
	hosted: { shown: false, up: false, openAnyway: () => undefined },
	onRetry: () => undefined,
	onSkipAgent: () => undefined,
	onChoose: () => undefined,
	...more,
});
const show = async (more: Record<string, unknown> = {}) => {
	current = await render(createElement(PreviewStatus, props(more) as never));
};
const title = () => document.querySelector('[data-slot="empty-title"]')?.textContent;

describe('before the page opens', () => {
	it('says what the agent is building, with its log and the way to take it over', async () => {
		await show();
		expect(document.querySelector('[data-slot="empty"]')).not.toBeNull();
		expect(title()).toBe('Building Alert history…');
		expect(document.querySelector('[data-slot="empty-icon"]')).not.toBeNull();
		expect(document.querySelector('[aria-live]')?.textContent).toBe('Reading AlertHistory.tsx');
		expect(button('Take over in Claude Code')).toBeTruthy();
	});

	it('says why a build failed, with its log, the editor, and Try again', async () => {
		const onRetry = vi.fn();
		await show({ phase: { kind: 'failed', message: 'npm run design-mode exited with code 1' }, onRetry });
		expect(document.querySelector('[data-slot="alert"]')?.textContent).toBe('npm run design-mode exited with code 1');
		expect(button('Continue in Claude Code')).toBeTruthy();
		await press(button('Try again'));
		expect(onRetry).toHaveBeenCalledOnce();
	});

	it('says what to do when there is no product repository to build it with', async () => {
		const onChoose = vi.fn();
		await show({ checkout: null, phase: { kind: 'idle' }, onChoose });
		expect(title()).toBe('DSNR needs the product repository to show this.');
		await press(button('Find it'));
		expect(onChoose).toHaveBeenCalledOnce();
	});
});
