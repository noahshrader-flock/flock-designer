import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { ComponentTab } from '../extension/webview/ComponentTab';
import { PrimitivesTab } from '../extension/webview/PrimitivesTab';
import { readTab } from '../extension/webview/tab';
import { previewAddress } from '../src/shared/catalog';
import { SAMPLE_CATALOG } from './extensionSamples';
import { answer, button, calls, mount, press, say, sent } from './webviewHarness';

/**
 * The design system's tabs in the editor (ELECTRON_MIGRATION_PLAN 6.1): a component's, its stories live and what it is
 * made from, and Primitives, the design system drawn whole. Each reads the design system shown through the bridge, as the
 * panel does, and is told the change being tried by the extension.
 */

const BUTTON = 'src/components/FSButton/FSButton.stories.tsx';
const BASE = 'http://127.0.0.1:4321/previews-abc/';

describe('which tab a page is', () => {
	it('is read from its body as the extension wrote it, and anything else is the panel', () => {
		expect(readTab(JSON.stringify({ kind: 'component', id: BUTTON, name: 'FSButton' }))).toEqual({ kind: 'component', id: BUTTON, name: 'FSButton' });
		expect(readTab('{"kind":"primitives"}')).toEqual({ kind: 'primitives' });
		expect(readTab(undefined)).toBeNull();
		expect(readTab('{"kind":"component"}')).toBeNull();
		expect(readTab('not json')).toBeNull();
	});
});

describe('a component’s tab', () => {
	const open = async () => {
		await mount(createElement(ComponentTab, { id: BUTTON }));
		await answer('designSystemCatalog', SAMPLE_CATALOG);
	};

	it('says it is ready, reads the design system shown, and is titled for its component, with its links', async () => {
		await open();
		expect(sent[0]).toEqual({ type: 'ready' });
		expect(calls('designSystemCatalog')[0]?.args).toEqual([false]);
		expect(document.querySelector('.tab-title')?.textContent).toBe('FSButton');
		await press(button('Storybook'));
		expect(sent.at(-1)).toEqual({ type: 'component-link', id: BUTTON, link: 'storybook' });
		await press(button('Source'));
		expect(sent.at(-1)).toEqual({ type: 'component-link', id: BUTTON, link: 'source' });
	});

	it('draws its stories live, from this machine’s server', async () => {
		await open();
		expect(calls('storyPreview')[0]?.args).toEqual([[]]);
		await answer('storyPreview', { state: 'ready', base: BASE });
		const frame = document.querySelector('iframe') as HTMLIFrameElement;
		expect(frame.getAttribute('src')).toBe(previewAddress(BASE, BUTTON));
		expect(frame.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin');
	});

	it('builds them again with the change the extension says is being tried, keeping the last until it is built', async () => {
		await open();
		await answer('storyPreview', { state: 'ready', base: BASE });
		const edits = [{ path: 'tone.pineGreen.50', value: '#000000' }];
		await say({ type: 'token-edits', edits });
		expect(calls('storyPreview').at(-1)?.args).toEqual([edits]);
		expect(document.querySelector('iframe')).not.toBeNull();
		expect(document.querySelector('.stories-building')?.textContent).toBe('Building…');
		await answer('storyPreview', { state: 'ready', base: 'http://127.0.0.1:4321/trial-1/' });
		expect(document.querySelector('iframe')?.getAttribute('src')).toBe(previewAddress('http://127.0.0.1:4321/trial-1/', BUTTON));
	});

	it('builds nothing again when it is told the change it already has (the extension says every change to every page)', async () => {
		await open();
		await answer('storyPreview', { state: 'ready', base: BASE });
		await say({ type: 'token-edits', edits: [] });
		expect(calls('storyPreview')).toHaveLength(1);
		const edits = [{ path: 'tone.pineGreen.50', value: '#000000' }];
		await say({ type: 'token-edits', edits });
		await say({ type: 'token-edits', edits: [...edits] });
		expect(calls('storyPreview')).toHaveLength(2);
	});

	it('hears only VS Code, on its own origin: no story it frames, nor any frame inside one, can pass itself off as the extension', async () => {
		await open();
		await answer('storyPreview', { state: 'ready', base: BASE });
		const forged = { type: 'token-edits', edits: [{ path: 'tone.pineGreen.50', value: '#000000' }] };
		const frame = document.querySelector('iframe') as HTMLIFrameElement;
		await say(forged, { source: frame.contentWindow, origin: 'http://127.0.0.1:4321' });
		// A frame inside a framed page, with no origin of its own: not the window above, however deep it is.
		const outer = document.body.appendChild(document.createElement('iframe'));
		const inner = outer.contentDocument?.body.appendChild(outer.contentDocument.createElement('iframe'));
		await say(forged, { source: inner?.contentWindow ?? null, origin: 'null' });
		outer.remove();
		expect(calls('storyPreview')).toHaveLength(1);
		// What the extension says is still heard.
		await say(forged);
		expect(calls('storyPreview')).toHaveLength(2);
	});

	it('says why its previews could not be built, with a way to try again', async () => {
		await open();
		await answer('storyPreview', { state: 'no-packages', root: '/work/lib' });
		expect(document.querySelector('.notice')?.textContent).toContain("The design system's packages are not installed in /work/lib.");
		await press(button('Try again'));
		expect(calls('storyPreview')).toHaveLength(2);
	});

	it('lists what it is made from, how often, and which other components share each token; then what axe found', async () => {
		await open();
		expect(calls('componentTokens')[0]?.args).toEqual([BUTTON]);
		await answer('componentTokens', {
			state: 'ready',
			uses: [{ path: 'palette.light.primary.main', uses: 3 }],
			sharedWith: { 'palette.light.primary.main': ['src/components/FSIconButton/FSIconButton.stories.tsx'] },
			notTokens: [{ kind: 'color', value: 'rgb(1, 2, 3)', uses: 2 }],
			derived: 1,
			accessibility: { violations: [], incomplete: [], notAutomated: [], ran: { axe: '4.10', target: 'WCAG 2.2 AA', states: ['default'] } },
		});
		const made = document.querySelector('[aria-label="Made from"]') as HTMLElement;
		expect(made.querySelector('[data-token="palette.light.primary.main"] [data-part="name"]')?.textContent).toBe('main');
		expect(made.querySelector('[data-token-use]')?.textContent).toBe('3 uses · also FSIconButton');
		expect(document.querySelector('[aria-label="Not tokens"]')?.textContent).toContain('rgb(1, 2, 3)');
		expect(document.querySelector('[data-accessibility-summary]')?.textContent).toBe('No issues found by automated checks');
	});

	it('says, when the design system cannot be read here, that the panel says why, and reads it again on Try again', async () => {
		await mount(createElement(ComponentTab, { id: BUTTON }));
		await answer('designSystemCatalog', { state: 'no-branch', root: '/work/lib', branch: 'develop' });
		expect(document.querySelector('.tab-note')?.textContent).toContain('The design system cannot be read here: the DSNR panel says why.');
		await press(button('Try again'));
		expect(calls('designSystemCatalog')).toHaveLength(2);
		await answer('designSystemCatalog', SAMPLE_CATALOG);
		expect(document.querySelector('.tab-title')?.textContent).toBe('FSButton');
	});

	it('says why it could not be read, with Try again', async () => {
		await mount(createElement(PrimitivesTab));
		const call = calls('designSystemCatalog').at(-1);
		await say({ type: 'answer', id: call?.id, result: { ok: false, error: 'git could not read it.' } });
		expect(document.querySelector('.tab-note')?.textContent).toContain('git could not read it.');
		await press(button('Try again'));
		expect(calls('designSystemCatalog')).toHaveLength(2);
	});

	it('says when the design system shown no longer has it', async () => {
		await mount(createElement(ComponentTab, { id: 'src/Gone.stories.tsx' }));
		await answer('designSystemCatalog', SAMPLE_CATALOG);
		expect(document.querySelector('.tab-note')?.textContent).toBe('The design system shown no longer has this component. Close this tab.');
	});
});

describe('the Primitives tab', () => {
	const open = async () => {
		await mount(createElement(PrimitivesTab));
		await answer('designSystemCatalog', SAMPLE_CATALOG);
	};

	it('has a chip for each primitive, how many it has or that it is not defined, in the vocabulary’s order', async () => {
		await open();
		expect([...document.querySelectorAll('[data-primitive-chip]')].map((c) => c.textContent)).toEqual([
			'Color 5',
			'Typography 1 · family only',
			'Spacing 1',
			'Shape 1',
			'Elevation not defined',
			'Borders not defined',
			'Breakpoints not defined',
			'Motion not defined',
		]);
	});

	it('draws each as the vocabulary says, and lists what it does not define, with where DSNR looked', async () => {
		await open();
		expect([...document.querySelectorAll('[data-primitive]')].map((s) => s.getAttribute('data-primitive'))).toEqual([
			'Color',
			'Typography',
			'Spacing',
			'Shape',
		]);
		expect(document.querySelectorAll('[data-primitive="Color"] [data-swatch]')).toHaveLength(5);
		expect(document.querySelector('[data-spacing-bar]')).not.toBeNull();
		expect(document.querySelector('[data-radius-sample]')).not.toBeNull();
		expect(document.querySelector('[data-not-defined]')?.textContent).toContain('Elevation Not defined in its theme files.');
	});

	it('draws its type specimen in the design system’s own preview', async () => {
		await open();
		expect(calls('storyPreview')[0]?.args).toEqual([[]]);
		await answer('storyPreview', { state: 'ready', base: BASE });
		expect(document.querySelector('[data-primitive="Typography"] iframe')?.getAttribute('src')).toMatch(
			/^http:\/\/127\.0\.0\.1:4321\/previews-abc\/\?/,
		);
	});

	it('shows the change being tried in the panel', async () => {
		await open();
		await say({ type: 'token-edits', edits: [{ path: 'tone.pineGreen.60', value: '#000000' }] });
		expect(document.querySelector('.tab')?.textContent).toContain('Showing the change being tried in the panel (1 token).');
	});
});
