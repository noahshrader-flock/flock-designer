// @vitest-environment jsdom
import { act, createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ComponentPage } from '../src/renderer/ComponentPage';
import { TooltipProvider } from '../src/renderer/ui/tooltip';
import type { CatalogComponent, StoryPreview } from '../src/shared/contract';
import { button, fail, fakeApp, ok, openMenu, press, render, settle, unmountAll } from './reviewHarness';

/**
 * A component on its own page (P2 of the design system plan): its name, line and links, and each story file live in a
 * sandboxed frame from the previews P1 builds. Against a fake app.
 */

const BASE = 'http://127.0.0.1:4000/previews-abc/';
const component = (more: Partial<CatalogComponent> = {}): CatalogComponent => ({
	id: 'components/FSButton',
	name: 'FSButton',
	group: 'Buttons',
	composite: false,
	subtitle: 'Buttons allow users to take actions.',
	stories: [{ file: 'src/components/FSButton/FSButton.stories.tsx', title: 'Buttons/FSButton', storybook: 'https://sb.example/button' }],
	figma: null,
	source: 'https://github.com/x/FSButton',
	partOf: null,
	...more,
});
const POPOVERS = component({
	id: 'compositeComponents/FSPopovers',
	name: 'FSPopovers',
	stories: [
		{ file: 'src/compositeComponents/FSPopovers/a.stories.tsx', title: 'Popovers/PopoverHeader', storybook: 'https://sb.example/a' },
		{ file: 'src/compositeComponents/FSPopovers/b.stories.tsx', title: null, storybook: null },
	],
});

let current: Awaited<ReturnType<typeof render>> | null = null;
const show = async (c: CatalogComponent, answer: () => Promise<ReturnType<typeof ok<StoryPreview>> | ReturnType<typeof fail>> = async () => ok({ state: 'ready', base: BASE }), more: Record<string, unknown> = {}) => {
	const app = fakeApp({ storyPreview: answer });
	(window as unknown as { workspace: unknown }).workspace = app.api;
	const props = { component: c, parent: null, commit: 'c1', onBack: vi.fn(), onOpen: vi.fn(), ...more };
	current = await render(createElement(ComponentPage, props));
	return { app, props };
};
const frames = () => [...document.querySelectorAll('iframe')];
const text = () => document.body.textContent ?? '';

afterEach(async () => {
	if (current) await unmountAll(current.root);
	current = null;
	document.body.innerHTML = '';
});

describe('the page', () => {
	it('names the component, says its line, and has its links in the More menu', async () => {
		await show(component());
		expect(document.querySelector('h3')?.textContent).toBe('FSButton');
		expect(text()).toContain('Buttons allow users to take actions.');
		const items = await openMenu(button('More for FSButton'));
		expect(items.map((i) => [i.textContent, i.getAttribute('href')])).toEqual([
			['Storybook', 'https://sb.example/button'],
			['Source', 'https://github.com/x/FSButton'],
		]);
	});

	it('goes back with Back', async () => {
		const { props } = await show(component());
		await press(button('Back to components'));
		expect(props.onBack).toHaveBeenCalledOnce();
	});
});

describe('the previews', () => {
	it('shows each story file in a sandboxed frame of the built page, asked for once', async () => {
		const { app } = await show(POPOVERS);
		expect(app.calls.storyPreview).toHaveLength(1);
		expect(frames().map((f) => f.getAttribute('src'))).toEqual([
			`${BASE}?file=${encodeURIComponent('src/compositeComponents/FSPopovers/a.stories.tsx')}`,
			`${BASE}?file=${encodeURIComponent('src/compositeComponents/FSPopovers/b.stories.tsx')}`,
		]);
		// An origin of its own (the local server's), so the library can load; scripts, and nothing else.
		expect(frames().every((f) => f.getAttribute('sandbox') === 'allow-scripts allow-same-origin')).toBe(true);
		// A file with several stories names each frame; one without a title is named by its file.
		expect([...document.querySelectorAll('[data-slot="card-title"]')].map((t) => t.textContent)).toEqual(['PopoverHeader', 'b']);
	});

	it('names no frame when the component has one story file', async () => {
		await show(component());
		expect(frames()).toHaveLength(1);
		expect(document.querySelector('[data-slot="card-title"]')).toBeNull();
	});

	it('says it is building while the build runs', async () => {
		let finish: (v: ReturnType<typeof ok<StoryPreview>>) => void = () => undefined;
		await show(component(), () => new Promise((r) => (finish = r)));
		expect(text()).toContain('Building previews…');
		expect(frames()).toHaveLength(0);
		await act(async () => finish(ok({ state: 'ready', base: BASE })));
		await settle();
		expect(frames()).toHaveLength(1);
	});

	it('grows a frame to the height its own page says, and takes no height from anywhere else', async () => {
		await show(component());
		const frame = frames()[0]!;
		const tell = (data: unknown, source: MessageEventSource | null) => act(async () => void window.dispatchEvent(new MessageEvent('message', { data, source })));
		await tell({ flockPreviewHeight: 640 }, frame.contentWindow);
		expect(frame.style.height).toBe('640px');
		await tell({ flockPreviewHeight: 99 }, window);
		await tell({ flockPreviewHeight: 'tall' }, frame.contentWindow);
		await tell({ flockPreviewHeight: Infinity }, frame.contentWindow);
		expect(frame.style.height).toBe('640px');
		await tell({ flockPreviewHeight: 1e9 }, frame.contentWindow);
		expect(frame.style.height).toBe('4000px');
	});

	it('asks again when the list was synced to a new commit', async () => {
		const { app, props } = await show(component());
		await act(async () => current!.root.render(createElement(TooltipProvider, null, createElement(ComponentPage, { ...props, commit: 'c2' }))));
		await settle();
		expect(app.calls.storyPreview).toHaveLength(2);
	});

	it('says why previews could not be built, and tries again', async () => {
		let answer: ReturnType<typeof ok<StoryPreview>> | ReturnType<typeof fail> = ok({ state: 'no-packages', root: '/h/fui' });
		const { app } = await show(component(), async () => answer);
		expect(text()).toContain('The library’s packages are not installed in /h/fui'.replace('’', "'"));
		answer = ok({ state: 'failed', error: 'src/components/FSButton/index.tsx: Unexpected "}"' });
		await press(button('Try again'));
		await settle();
		expect(text()).toContain('Unexpected "}"');
		answer = fail('git broke');
		await press(button('Try again'));
		await settle();
		expect(text()).toContain('git broke');
		expect(app.calls.storyPreview).toHaveLength(3);
	});
});

describe('a component with no stories', () => {
	it('builds nothing, and sends a part to its parent', async () => {
		const parent = component({ id: 'components/FSCard', name: 'FSCard' });
		const { app, props } = await show(component({ id: 'components/FSCardContent', name: 'FSCardContent', stories: [], partOf: 'components/FSCard' }), undefined, { parent });
		expect(app.calls.storyPreview).toBeUndefined();
		expect(text()).toContain('A part of FSCard, shown in its stories.');
		await press(button('FSCard'));
		expect(props.onOpen).toHaveBeenCalledWith('components/FSCard');
	});

	it('says a gap has no stories to preview', async () => {
		await show(component({ name: 'FSApp', stories: [] }));
		expect(text()).toContain('This component has no stories to preview.');
	});
});
