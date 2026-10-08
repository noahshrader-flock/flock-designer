// @vitest-environment jsdom
import { act, createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PREVIEW_HEIGHT, previewAddress } from '../src/shared/catalog';
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
	id: 'src/components/FSButton/FSButton.stories.tsx',
	name: 'FSButton',
	group: 'Buttons',
	subtitle: 'Buttons allow users to take actions.',
	storybook: 'https://sb.example/button',
	source: 'https://github.com/x/FSButton',
	...more,
});

let current: Awaited<ReturnType<typeof render>> | null = null;
const show = async (c: CatalogComponent, answer: () => Promise<ReturnType<typeof ok<StoryPreview>> | ReturnType<typeof fail>> = async () => ok({ state: 'ready', base: BASE }), more: Record<string, unknown> = {}) => {
	const app = fakeApp({ storyPreview: answer });
	(window as unknown as { workspace: unknown }).workspace = app.api;
	const props = { component: c, commit: 'c1', onBack: vi.fn(), ...more };
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

	it('leaves the Storybook link out for a library with no hosted Storybook', async () => {
		await show(component({ storybook: null }));
		const items = await openMenu(button('More for FSButton'));
		expect(items.map((i) => i.textContent)).toEqual(['Source']);
		expect(items.every((i) => i.getAttribute('target') === '_blank' && i.getAttribute('rel') === 'noreferrer')).toBe(true);
	});

	it('goes back with Back', async () => {
		const { props } = await show(component());
		await press(button('Back to components'));
		expect(props.onBack).toHaveBeenCalledOnce();
	});
});

describe('the previews', () => {
	it('shows the component’s story file in a sandboxed frame of the built page, asked for once', async () => {
		const { app } = await show(component());
		expect(app.calls.storyPreview).toHaveLength(1);
		expect(frames().map((f) => f.getAttribute('src'))).toEqual([previewAddress(BASE, 'src/components/FSButton/FSButton.stories.tsx')]);
		// An origin of its own (the local server's), so the library can load; scripts, and nothing else.
		expect(frames()[0]!.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin');
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
		await tell({ [PREVIEW_HEIGHT]: 640 }, frame.contentWindow);
		expect(frame.style.height).toBe('640px');
		await tell({ [PREVIEW_HEIGHT]: 99 }, window);
		await tell({ [PREVIEW_HEIGHT]: 'tall' }, frame.contentWindow);
		await tell({ [PREVIEW_HEIGHT]: Infinity }, frame.contentWindow);
		expect(frame.style.height).toBe('640px');
		await tell({ [PREVIEW_HEIGHT]: 1e9 }, frame.contentWindow);
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
