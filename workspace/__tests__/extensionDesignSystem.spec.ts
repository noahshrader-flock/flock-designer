import { describe, expect, it, vi } from 'vitest';
import { componentLink, componentOf, editsAfterRead, keepMode, keptMode, libraryFileIn, showFound, shownFrom } from '../extension/src/designSystem';
import { SAMPLE_CATALOG } from './extensionSamples';
import { withTrial } from '../extension/src/messages';
import { Shared } from '../extension/src/sharedValues';
import type { Catalog, CatalogComponent, ConnectedDesignSystem } from '../src/shared/contract';

/** The core acts on the design system it is told is shown, so the folder VS Code found is told to it when it differs. */

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

describe('the mode components are shown in', () => {
	it('is light until dark is chosen, kept for the next session, and told to every page only when it changes', () => {
		const state = new Map<string, unknown>();
		const kept = { get: (key: string) => state.get(key), update: async (key: string, value: unknown) => void state.set(key, value) };
		const post = vi.fn();
		const mode = new Shared('mode', keptMode(kept), post, (next) => keepMode(kept, next));
		expect(mode.current()).toBe('light');
		mode.set('dark');
		expect(post).toHaveBeenCalledWith({ type: 'shared', name: 'mode', value: 'dark' });
		mode.set('dark');
		expect(post).toHaveBeenCalledTimes(1);
		// A new session reads what was kept; what was kept that is no mode is light.
		expect(keptMode(kept)).toBe('dark');
		state.set('dsnr.mode', 'sepia');
		expect(keptMode(kept)).toBe('light');
	});
});

describe('the values tried on every component (the changes being tried, DESIGN_SYSTEM.md)', () => {
	const SMALL = { property: 'height' as const, value: '32px', targets: ['a', 'b'] };
	it('are kept by the extension, each with its commit, told to every page only when they change, and none kept when none is tried', () => {
		const post = vi.fn();
		const values = new Shared('valueTrials', {}, post);
		const set = (file: string, commit: string, tried: (typeof SMALL)[]) => values.set(withTrial(values.current(), file, commit, tried));
		set('Button.stories.tsx', 'abc123', [SMALL]);
		expect(post).toHaveBeenLastCalledWith({
			type: 'shared',
			name: 'valueTrials',
			value: { 'Button.stories.tsx': { commit: 'abc123', values: [SMALL] } },
		});
		// The same again says nothing; on another commit it is another change.
		set('Button.stories.tsx', 'abc123', [SMALL]);
		expect(post).toHaveBeenCalledTimes(1);
		set('Button.stories.tsx', 'def456', [SMALL]);
		expect(post).toHaveBeenCalledTimes(2);
		set('Badge.stories.tsx', 'def456', [SMALL]);
		set('Button.stories.tsx', 'def456', []);
		expect(values.current()).toEqual({ 'Badge.stories.tsx': { commit: 'def456', values: [SMALL] } });
		set('Card.stories.tsx', 'def456', []);
		expect(post).toHaveBeenCalledTimes(4);
	});
});

describe('the change to the tokens being tried, once the library is read again', () => {
	const ready = SAMPLE_CATALOG;
	const gone = { path: 'tone.pineGreen.50', value: '#000000' };
	const kept = { path: 'spacing', value: '12px' };
	const without = { ...ready, tokens: { ...ready.tokens, tokens: ready.tokens.tokens.filter((t) => t.path !== gone.path) } };
	it('keeps only what was tried on tokens the library still has, as the app does', () => {
		expect(editsAfterRead([gone, kept], without)).toEqual([kept]);
	});
	it('lets nothing go for a branch handed to Claude Code shown in the library’s place', () => {
		expect(editsAfterRead([gone, kept], { ...without, showing: 'dsnr/handoff-20261017-ab12' })).toEqual([gone, kept]);
	});
});

describe('the change to the tokens being tried', () => {
	it('is kept by the extension and told to every page, only when it changes', () => {
		const post = vi.fn();
		const trial = new Shared('tokenEdits', [], post);
		const edits = [
			{ path: 'palette.light.primary.main', value: '#112233' },
			{ path: 'spacing', value: '12px' },
		];
		trial.set(edits);
		expect(post).toHaveBeenCalledWith({ type: 'shared', name: 'tokenEdits', value: edits });
		expect(trial.current()).toEqual(edits);
		// The same change in another order is the same change: nothing is told.
		trial.set([...edits].reverse());
		expect(post).toHaveBeenCalledTimes(1);
		trial.set([]);
		expect(post).toHaveBeenLastCalledWith({ type: 'shared', name: 'tokenEdits', value: [] });
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
	it('is found in the catalog every page shows, by its story file, and nothing else is', () => {
		expect(componentOf(catalog([button]), button.id)).toEqual(button);
		expect(() => componentOf(catalog([button]), 'src/Other.stories.tsx')).toThrow('The design system shown has no component src/Other.stories.tsx.');
		expect(() => componentOf(null, button.id)).toThrow('The design system shown has no component');
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
		expect(libraryFileIn(system, 'src/colors/theme/light.ts')).toBe('/w/lib/src/colors/theme/light.ts');
		expect(libraryFileIn(system, '../secrets.ts')).toBeNull();
		expect(libraryFileIn(system, '/etc/passwd')).toBeNull();
		expect(libraryFileIn(system, '')).toBeNull();
	});
});

describe('the design system shown, when the one found cannot be read', () => {
	const named = { root: '/w/plain', how: 'named' as const };
	const located = { root: '/w/flock-react-component-lib', how: 'located' as const };
	const readable = (roots: string[]) =>
		vi.fn(async (f: { root: string } | null) => (f === null || roots.includes(f.root) ? null : `${f.root} cannot be read.`));

	it('is the one the person located instead, when that can be read: locating it is how they said which', async () => {
		const show = readable([located.root]);
		expect(await shownFrom(named, located.root, { show, at: async () => located })).toEqual({ designSystem: located, unreadable: null });
		expect(show).toHaveBeenLastCalledWith(located);
	});

	it('is the one found, and why, when nothing was located or what was cannot be read either', async () => {
		const why = { designSystem: named, unreadable: '/w/plain cannot be read.' };
		expect(await shownFrom(named, null, { show: readable([]), at: async () => located })).toEqual(why);
		expect(await shownFrom(named, located.root, { show: readable([]), at: async () => located })).toEqual(why);
		expect(await shownFrom(named, '/w/empty', { show: readable([]), at: async () => null })).toEqual(why);
	});

	it('is the one found when it can be read, whatever was located', async () => {
		const at = vi.fn();
		const open = { root: '/w/ui', how: 'open' as const };
		expect(await shownFrom(open, located.root, { show: readable(['/w/ui']), at })).toEqual({ designSystem: open, unreadable: null });
		expect(at).not.toHaveBeenCalled();
	});
});
