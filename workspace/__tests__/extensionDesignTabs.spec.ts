import { describe, expect, it, vi } from 'vitest';
import { DesignTabs } from '../extension/src/designTabs';
import type { DesignTab } from '../extension/src/messages';

/**
 * The design system's tabs in VS Code's editor (ELECTRON_MIGRATION_PLAN 6.1): a component's (its stories, live, and what
 * it is made from) and Primitives, where there is room that the side bar does not have. Each is DSNR's own page, told the
 * core's events as the panel is, its asks answered as the panel's are; one tab each, brought forward when open again.
 */

const world = () => {
	const made: { title: string; revealed: number; html: string; dispose: () => void; said: ((raw: unknown) => void)[] }[] = [];
	const create = vi.fn((title: string) => {
		const tab = { title, revealed: 0, html: '', dispose: (): void => undefined, said: [] as ((raw: unknown) => void)[] };
		made.push(tab);
		return {
			get title() {
				return tab.title;
			},
			reveal: () => void tab.revealed++,
			onDidDispose: (l: () => void) => ((tab.dispose = l), { dispose: () => undefined }),
			webview: {
				set html(h: string) {
					tab.html = h;
				},
				onDidReceiveMessage: (l: (raw: unknown) => void) => (tab.said.push(l), { dispose: () => undefined }),
				postMessage: async () => true,
			},
		};
	});
	const stopped = vi.fn();
	const deps = {
		create,
		page: vi.fn(async (_webview: unknown, tab: DesignTab) => `<page ${JSON.stringify(tab)}>`),
		panels: { add: vi.fn(() => ({ dispose: stopped })) },
		receive: vi.fn(async () => undefined),
	};
	return { tabs: new DesignTabs(deps as never), deps, made, stopped };
};
const button: DesignTab = { kind: 'component', id: 'src/FSButton.stories.tsx', name: 'FSButton' };

describe('a design system’s tab', () => {
	it('is DSNR’s own page for what it shows, titled for it, told the core’s events as the panel is', async () => {
		const { tabs, deps, made } = world();
		await tabs.open(button);
		expect(deps.create).toHaveBeenCalledWith('FSButton');
		expect(made[0]?.html).toBe(`<page ${JSON.stringify(button)}>`);
		expect(deps.panels.add).toHaveBeenCalledTimes(1);
		await tabs.open({ kind: 'primitives' });
		expect(deps.create).toHaveBeenLastCalledWith('Primitives');
	});

	it('is one for each component, and brought forward when it is opened again', async () => {
		const { tabs, deps, made } = world();
		await tabs.open(button);
		await tabs.open(button);
		expect(deps.create).toHaveBeenCalledTimes(1);
		expect(made[0]?.revealed).toBe(1);
		await tabs.open({ kind: 'component', id: 'src/FSCard.stories.tsx', name: 'FSCard' });
		expect(deps.create).toHaveBeenCalledTimes(2);
	});

	it('has what its page asks answered as the panel’s is', async () => {
		const { tabs, deps, made } = world();
		await tabs.open(button);
		made[0]?.said[0]?.({ type: 'ready' });
		expect(deps.receive).toHaveBeenCalledWith(expect.anything(), { type: 'ready' });
	});

	it('closed, is forgotten, and hears nothing more; opened again, it is a new one', async () => {
		const { tabs, deps, made, stopped } = world();
		await tabs.open(button);
		made[0]?.dispose();
		expect(stopped).toHaveBeenCalled();
		await tabs.open(button);
		expect(deps.create).toHaveBeenCalledTimes(2);
	});

	it('of components are all closed when another design system is shown, since they are of the last one’s', async () => {
		const { tabs, deps } = world();
		const closed: string[] = [];
		deps.create.mockImplementation(((title: string) => ({
			title,
			reveal: () => undefined,
			dispose: () => void closed.push(title),
			onDidDispose: () => ({ dispose: () => undefined }),
			webview: { set html(_h: string) {}, onDidReceiveMessage: () => ({ dispose: () => undefined }), postMessage: async () => true },
		})) as never);
		await tabs.open(button);
		await tabs.open({ kind: 'primitives' });
		tabs.closeComponents();
		expect(closed).toEqual(['FSButton']);
	});
});
