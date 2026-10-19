import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { Viewer } from '../src/viewer/Viewer';
import { PAGE_CONFIG, PAGE_SIGN_IN, sitePage } from './pageHarness';
import { render, settle, stateMenu, unmountAll } from './reviewHarness';

/** A control of another size than the kit's default is what makes a row look uneven. */

let current: Awaited<ReturnType<typeof render>> | null = null;
afterEach(async () => {
	if (current) await unmountAll(current.root);
	current = null;
});

describe('the top bar', () => {
	it('has controls of the kit’s one default size on a published page: none of them small', async () => {
		const page = sitePage();
		current = await render(
			createElement(Viewer, { config: { ...PAGE_CONFIG, states: ['default', 'panel'] }, slots: page.slots, signIn: PAGE_SIGN_IN }),
		);
		await settle();
		const bar = document.querySelector('.viewer-bar') as HTMLElement;
		// The way back, the version, the states, light and dark, and Sign in to comment.
		const controls = [...bar.querySelectorAll<HTMLElement>('a.icon-button, .button, .select, .toggle')];
		expect(controls.length).toBe(5);
		expect(controls.includes(stateMenu()?.closest('.select') as HTMLElement)).toBe(true);
		expect(bar.querySelectorAll('.icon-button-small, .menu-button-small')).toHaveLength(0);
	});
});
