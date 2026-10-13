import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { PublishProblems, shownStatus } from '../src/renderer/PublishStatus';
import type { PublishStatus } from '../src/shared/contract';
import { button, dialog, press, render, settle, unmountAll } from './reviewHarness';

/**
 * What is held back from syncing: a problems button beside Sync (`ProblemsDialog`) and, in its dialog, each thing, why, and
 * the files it is about, one to a line. Nothing when everything is synced.
 */

const AT = '2026-10-08T10:00:00Z';
const held: PublishStatus = {
	state: 'held',
	at: AT,
	problems: [
		{
			what: 'Project records',
			why: '3 changes outside the project records are waiting to be pushed. Records are held back; push those yourself, and records will flow again.',
			files: ['workspace/__tests__/designSystem.spec.ts', 'workspace/src/renderer/DesignSystem.tsx', 'README.md'],
		},
		{ what: 'feature/role-comparison', why: 'It has changes on GitHub that this machine does not have, so it was not pushed.' },
	],
};

let current: Awaited<ReturnType<typeof render>> | null = null;
const show = async (status: PublishStatus) => {
	current = await render(createElement(PublishProblems, { status }));
};
afterEach(async () => {
	if (current) await unmountAll(current.root);
	current = null;
	document.body.innerHTML = '';
});

describe('what is not synced', () => {
	it('is nothing when everything is synced, a sync is running with nothing held, there is nothing to sync, or it is held with nothing to name', async () => {
		for (const status of [
			{ state: 'unavailable' },
			{ state: 'working' },
			{ state: 'shared', at: AT },
			{ state: 'held', at: AT, problems: [] },
		] as PublishStatus[]) {
			await show(status);
			expect(document.body.textContent).toBe('');
			await unmountAll(current!.root);
		}
		current = null;
	});

	it('names each thing in a dialog, with why, and the files it is about as a list of their own, one to a line', async () => {
		await show(held);
		expect(dialog()).toBeNull();
		await press(button('Some work isn’t synced'));
		await settle();
		const d = dialog()!;
		expect(d.querySelector('[data-slot="dialog-title"]')?.textContent).toBe('Some work isn’t synced');
		const things = [...d.querySelectorAll(':scope [data-slot="dialog-body"] > ul > li')];
		expect(things.map((li) => li.firstElementChild?.textContent)).toEqual(['Project records', 'feature/role-comparison']);
		expect(things[0]!.textContent).toContain('3 changes outside the project records are waiting to be pushed.');
		// The files are in full, each its own line, and not run into the sentence.
		expect([...things[0]!.querySelectorAll('ul li')].map((li) => li.textContent)).toEqual(held.state === 'held' ? held.problems[0]!.files : []);
		expect(things[0]!.querySelector('[data-slot]')).toBeNull();
		// A thing with no files has no list.
		expect(things[1]!.querySelector('ul')).toBeNull();
	});
});

describe('shownStatus', () => {
	it('keeps what was held while the next sync runs, so the button does not flicker', () => {
		expect(shownStatus({ state: 'working' }, held)).toBe(held);
	});

	it('takes it down only when a sync ends without the problem', () => {
		expect(shownStatus({ state: 'shared', at: AT }, held).state).toBe('shared');
	});

	it('shows nothing during a run when nothing was held before it', () => {
		expect(shownStatus({ state: 'working' }, null).state).toBe('working');
	});
});
