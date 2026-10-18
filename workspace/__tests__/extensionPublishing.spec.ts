import { describe, expect, it, vi } from 'vitest';
import { publishedLink, syncItem } from '../extension/src/publishing';
import { ok } from '../src/shared/result';

/**
 * Publish and share in VS Code (ELECTRON_MIGRATION_PLAN 4.3): whether the person's work is synced, in VS Code's status
 * bar, with what is held back and why; and a review's published page, to open or to share its link, or why it has none.
 */

describe('the sync, in the status bar', () => {
	it('says where it is, and is not there when there is nothing to sync from here', () => {
		expect(syncItem({ state: 'unavailable' })).toBeNull();
		expect(syncItem({ state: 'working' })).toEqual({ text: '$(sync~spin) Syncing', tooltip: 'DSNR is syncing your work.' });
		expect(syncItem({ state: 'shared', at: '2026-10-13T10:00:00Z' })).toEqual({ text: '$(cloud) Synced', tooltip: 'Your work is synced.' });
		expect(syncItem({ state: 'held', problems: [{ what: 'a', why: 'b' }], at: '' })).toEqual({
			text: '$(warning) Not synced',
			tooltip: 'Some work isn’t synced: click to see why.',
		});
	});
});

describe('a review’s published page', () => {
	const review = { projectId: 'demo', name: 'v1', title: 'Demo · Version 1' };
	const deps = (status: unknown, choose: string | undefined = undefined) => ({
		api: {
			publishedPage: vi.fn(async () => ok(status)),
			publishPage: vi.fn(async () => ok({ state: 'publishing' })),
		},
		choose: vi.fn(async () => choose),
		tell: vi.fn(),
	});

	it('is its link, once it is on the site', async () => {
		const d = deps({ state: 'published', url: 'https://acme.github.io/design/demo/v1/' });
		expect(await publishedLink(d as never, review)).toBe('https://acme.github.io/design/demo/v1/');
	});

	it('says it is on its way while it is being published', async () => {
		const d = deps({ state: 'publishing' });
		expect(await publishedLink(d as never, review)).toBeNull();
		expect(d.tell).toHaveBeenCalledWith('Demo · Version 1 is being published: its page is ready in a minute or two.');
	});

	it('offers to publish it when it is saved but not on the site, with why, and publishes it when asked', async () => {
		const d = deps({ state: 'unpublished', why: 'The site’s build failed.' }, 'Publish');
		expect(await publishedLink(d as never, review)).toBeNull();
		expect(d.choose).toHaveBeenCalledWith('Demo · Version 1 is not on its page yet: The site’s build failed.', ['Publish']);
		expect(d.api.publishPage).toHaveBeenCalledWith('demo', 'v1');
		expect(d.tell).toHaveBeenCalledWith('Publishing Demo · Version 1: its page is ready in a minute or two.');
		const not = deps({ state: 'unpublished' });
		await publishedLink(not as never, review);
		expect(not.choose).toHaveBeenCalledWith('Demo · Version 1 is not on its page yet.', ['Publish']);
		expect(not.api.publishPage).not.toHaveBeenCalled();
	});

	it('says why when it cannot be told, or there is no site', async () => {
		await expect(publishedLink(deps({ state: 'unavailable', why: 'GitHub did not answer.' }) as never, review)).rejects.toThrow(
			'Whether Demo · Version 1 is on its page cannot be told: GitHub did not answer.',
		);
		await expect(publishedLink(deps({ state: 'none' }) as never, review)).rejects.toThrow('The design repository has no published site.');
	});
});
