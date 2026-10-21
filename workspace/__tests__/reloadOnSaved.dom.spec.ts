import { act, createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useReloadOnSaved } from '../src/viewer/comments/useReloadOnSaved';
import { render, unmountAll } from './ui';

const Probe = ({ saved, writing, reload }: { saved: number; writing: boolean; reload: () => void }) => {
	useReloadOnSaved(saved, writing, reload);
	return null;
};

let current: Awaited<ReturnType<typeof render>> | null = null;
afterEach(async () => {
	if (current) await unmountAll(current.root);
	current = null;
});
const show = async (reload: () => void, saved = 0, writing = false) => {
	current = await render(createElement(Probe, { saved, writing, reload }));
	return (next: { saved: number; writing: boolean }) => act(async () => current!.root.render(createElement(Probe, { ...next, reload })));
};

describe('reloading a page that was saved', () => {
	it('does nothing as it opens, nor while nothing is saved', async () => {
		const reload = vi.fn();
		const again = await show(reload, 0);
		await again({ saved: 0, writing: false });
		expect(reload).not.toHaveBeenCalled();
	});

	it('reloads at once when a save arrives and no comment is being written, once for each save', async () => {
		const reload = vi.fn();
		const again = await show(reload);
		await again({ saved: 1, writing: false });
		expect(reload).toHaveBeenCalledTimes(1);
		await again({ saved: 1, writing: false });
		expect(reload).toHaveBeenCalledTimes(1);
		await again({ saved: 2, writing: false });
		expect(reload).toHaveBeenCalledTimes(2);
	});

	it('waits while a comment is being written, and reloads once, when it is done', async () => {
		const reload = vi.fn();
		const again = await show(reload, 0, true);
		await again({ saved: 1, writing: true });
		await again({ saved: 2, writing: true });
		expect(reload).not.toHaveBeenCalled();
		await again({ saved: 2, writing: false });
		expect(reload).toHaveBeenCalledTimes(1);
		await again({ saved: 2, writing: false });
		expect(reload).toHaveBeenCalledTimes(1);
	});
});
