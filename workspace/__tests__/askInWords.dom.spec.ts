// @vitest-environment jsdom
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { DesignSystem, type DesignSystemDoes } from '../extension/webview/DesignSystem';
import { SAMPLE_CATALOG } from './extensionSamples';
import { answer, button, calls, mount, press, type } from './webviewHarness';

/**
 * Asking in words in the panel (Phase 6): on its Tokens, words about the design system made the token edits its controls make,
 * and given to the change every page tries, as a control's are.
 */
describe('asking in words, in the panel’s tokens', () => {
	it('asks with no component, and gives what comes back to the change being tried as its controls would, token by token', async () => {
		const setEdits = vi.fn();
		const tried = { path: 'tone.pineGreen.60', value: '#000000' };
		const does = { setEdits } as unknown as DesignSystemDoes;
		await mount(
			createElement(DesignSystem, {
				found: { root: '/work/flock-react-component-lib', how: 'named' } as never,
				unreadable: null,
				read: { catalog: SAMPLE_CATALOG, id: 'fui', name: 'FUI', error: null, syncing: false },
				pictures: { drawing: false, pictures: {}, issues: {} },
				part: 'tokens',
				onPart: () => undefined,
				view: 'grid',
				onView: () => undefined,
				edits: [tried],
				does,
			}),
		);
		await press(document.querySelector('button[aria-label="Ask in words"]') as HTMLElement);
		const dialog = document.querySelector('[role="dialog"][aria-label="Ask in words"]') as HTMLElement;
		expect(dialog.querySelector('.dialog-about')?.textContent).toContain('ask on its tab');
		await type(dialog.querySelector('textarea') as HTMLTextAreaElement, 'make the primary a little warmer');
		await press(button('Ask'));
		expect(calls('askInWords').at(-1)?.args).toEqual([null, 'make the primary a little warmer', [tried], []]);
		const edit = { path: 'tone.pineGreen.50', value: '#118063' };
		const again = { path: 'tone.pineGreen.60', value: '#111111' };
		// The primary pointed where the library points it is no change; the tone already tried is changed again, in its place.
		await answer('askInWords', {
			edits: [edit, { path: 'palette.light.primary.main', ref: 'tone.pineGreen.50' }, again],
			values: [],
			said: 'A warmer green.',
		});
		expect(setEdits).toHaveBeenLastCalledWith([edit, again]);
		expect(dialog.querySelector('[data-asked]')?.textContent).toContain('A warmer green.');
	});
});
