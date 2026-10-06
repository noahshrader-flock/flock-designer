import { describe, expect, it } from 'vitest';
import type { ShareStatus } from '../src/shared/contract';
import { waitUntilUp } from '../src/renderer/hostedPreview';
import { dialogView, isMine, stepText } from '../src/renderer/shareView';

const ready: ShareStatus = { state: 'ready', projectId: 'demo', name: 'i1', url: 'https://x', prUrl: 'https://y', published: { state: 'published' } };
const running: ShareStatus = { state: 'running', projectId: 'demo', name: 'i1', step: 'building' };
const failed: ShareStatus = { state: 'failed', projectId: 'demo', name: 'i1', message: 'no' };

describe('dialogView', () => {
	it('never shows an old result to someone who has just clicked Share again', () => {
		expect(dialogView('confirm', ready, true)).toBe('confirm');
		expect(dialogView('confirm', failed, true)).toBe('confirm');
	});

	it('follows the share once this window has started it', () => {
		expect(dialogView('working', running, true)).toBe('running');
		expect(dialogView('working', ready, true)).toBe('ready');
		expect(dialogView('working', failed, true)).toBe('failed');
	});

	it('does not show another iteration’s share as this one’s', () => {
		expect(dialogView('working', running, false)).toBe('confirm');
	});
});

describe('isMine', () => {
	it('matches project and iteration, and never idle', () => {
		expect(isMine(running, 'demo', 'i1')).toBe(true);
		expect(isMine(running, 'demo', 'i2')).toBe(false);
		expect(isMine(running, 'other', 'i1')).toBe(false);
		expect(isMine({ state: 'idle' }, 'demo', 'i1')).toBe(false);
	});
});

describe('stepText', () => {
	it('says what is happening, with the detail when there is one', () => {
		expect(stepText('pushing')).toBe('Pushing the branch');
		expect(stepText('building', 'PR Deployment')).toBe('Building the preview — PR Deployment');
	});
});

describe('waitUntilUp', () => {
	it('returns as soon as the address answers', async () => {
		let n = 0;
		expect(await waitUntilUp(async () => ++n === 3, () => true, 1)).toBe(true);
		expect(n).toBe(3);
	});

	it('stops checking once nobody is looking, instead of polling for ever', async () => {
		let n = 0;
		let live = true;
		const result = await waitUntilUp(async () => (++n === 2 && (live = false), false), () => live, 1);
		expect(result).toBe(false);
		expect(n).toBe(2);
	});
});
