import { describe, expect, it, vi } from 'vitest';
import { layoutSection } from '../extension/webview/layouts';

describe('the layout section of a view’s options', () => {
	it('is Layout, with Grid and List, each with its icon, the one in use checked', () => {
		const section = layoutSection('grid', () => undefined);
		expect(section.heading).toBe('Layout');
		expect(section.items.map((i) => [i.label, i.icon, i.checked])).toEqual([
			['Grid', 'layout', true],
			['List', 'list-unordered', false],
		]);
		expect(layoutSection('list', () => undefined).items.map((i) => i.checked)).toEqual([false, true]);
	});

	it('says which was chosen', () => {
		const chosen = vi.fn();
		layoutSection('grid', chosen).items[1]!.onSelect();
		expect(chosen).toHaveBeenCalledWith('list');
	});
});
