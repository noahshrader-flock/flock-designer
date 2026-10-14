import { describe, expect, it, vi } from 'vitest';
import { TokenTrial, componentLink, componentOf, showFound, tokenFileIn } from '../extension/src/designSystem';
import type { Catalog, CatalogComponent, ConnectedDesignSystem } from '../src/shared/contract';
import { ok } from '../src/shared/result';

/**
 * The design system VS Code found is the one the core shows (ELECTRON_MIGRATION_PLAN 6.1): the core reads, previews,
 * pictures and changes the design system it is told is shown, as the app's connected one, so the folder found is told to it
 * as that, and only when it is a different one. When it cannot be read, why is said instead.
 */

const fui: ConnectedDesignSystem = {
	id: 'flocksafety/flock-react-component-lib',
	name: 'FUI',
	repository: 'flocksafety/flock-react-component-lib',
	root: '/w/flock-react-component-lib',
	folder: '',
	branch: 'develop',
};
const memory = (current: ConnectedDesignSystem | null = null) => ({ current: vi.fn(() => current), add: vi.fn() });

describe('the design system found, shown', () => {
	it('is told to the core as the one shown, read from the folder found', async () => {
		const m = memory();
		const read = vi.fn(async () => fui);
		expect(await showFound(m, { root: fui.root, how: 'open' }, read)).toBeNull();
		expect(read).toHaveBeenCalledWith(fui.root);
		expect(m.add).toHaveBeenCalledWith(fui);
	});

	it('is not told again when it is the one shown already, so nothing is written for nothing', async () => {
		const m = memory(fui);
		expect(await showFound(m, { root: fui.root, how: 'named' }, async () => ({ ...fui }))).toBeNull();
		expect(m.add).not.toHaveBeenCalled();
		// Its default branch changed: told again.
		await showFound(m, { root: fui.root, how: 'named' }, async () => ({ ...fui, branch: 'main' }));
		expect(m.add).toHaveBeenCalledWith({ ...fui, branch: 'main' });
	});

	it('says why, and tells the core nothing, when the folder cannot be read', async () => {
		const m = memory();
		const why = await showFound(m, { root: '/w/plain', how: 'located' }, async () => {
			throw new Error('/w/plain is not a git repository.');
		});
		expect(why).toBe('/w/plain is not a git repository.');
		expect(m.add).not.toHaveBeenCalled();
	});

	it('with none found, tells the core nothing and has nothing to say', async () => {
		const m = memory(fui);
		const read = vi.fn();
		expect(await showFound(m, null, read)).toBeNull();
		expect(read).not.toHaveBeenCalled();
		expect(m.add).not.toHaveBeenCalled();
	});
});

describe('the change to the tokens being tried', () => {
	it('is kept by the extension and told to every page, only when it changes', () => {
		const post = vi.fn();
		const trial = new TokenTrial(post);
		expect(trial.current()).toEqual([]);
		const edits = [{ path: 'palette.light.primary.main', value: '#112233' }];
		trial.set(edits);
		expect(post).toHaveBeenCalledWith({ type: 'token-edits', edits });
		expect(trial.current()).toEqual(edits);
		// The same change in another order is the same change: nothing is told.
		trial.set([...edits]);
		expect(post).toHaveBeenCalledTimes(1);
		trial.set([]);
		expect(post).toHaveBeenLastCalledWith({ type: 'token-edits', edits: [] });
	});
});

const button: CatalogComponent = {
	id: 'src/components/FSButton/FSButton.stories.tsx',
	name: 'FSButton',
	group: 'Buttons',
	subtitle: null,
	storybook: 'https://storybook.example/?path=/docs/buttons-fsbutton--docs',
	source: 'https://github.com/flocksafety/flock-react-component-lib/tree/develop/src/components/FSButton',
};
const catalog = (components: CatalogComponent[]) =>
	({ state: 'ready', components, tokens: { source: null, tokens: [], problems: [], looked: [] } }) as unknown as Catalog;

describe('a component the page names', () => {
	it('is found in the catalog shown, by its story file, and nothing else is', async () => {
		const api = { designSystemCatalog: vi.fn(async () => ok(catalog([button]))) };
		expect(await componentOf(api, button.id)).toEqual(button);
		expect(api.designSystemCatalog).toHaveBeenCalledWith(false);
		await expect(componentOf(api, 'src/Other.stories.tsx')).rejects.toThrow('The design system shown has no component src/Other.stories.tsx.');
	});

	it('has its links from the catalog: its source always, its Storybook only when a hosted one is known', () => {
		expect(componentLink(button, 'source')).toBe(button.source);
		expect(componentLink(button, 'storybook')).toBe(button.storybook);
		expect(() => componentLink({ ...button, storybook: null }, 'storybook')).toThrow(/FSButton has no Storybook page DSNR knows/);
	});
});

describe('a token’s own file', () => {
	it('is in the design system’s clone, and nothing outside it is', () => {
		const system = { root: '/w/lib' };
		expect(tokenFileIn(system, 'src/colors/theme/light.ts')).toBe('/w/lib/src/colors/theme/light.ts');
		expect(tokenFileIn(system, '../secrets.ts')).toBeNull();
		expect(tokenFileIn(system, '/etc/passwd')).toBeNull();
		expect(tokenFileIn(system, '')).toBeNull();
	});
});
