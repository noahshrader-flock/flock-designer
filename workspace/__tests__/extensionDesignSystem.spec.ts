import { describe, expect, it, vi } from 'vitest';
import {
	NOT_THIS_ONE,
	USE_IT,
	askSource,
	askStorybook,
	componentLink,
	componentOf,
	editsAfterRead,
	keepMode,
	keptMode,
	libraryFileIn,
	openComponentLink,
	showFound,
	pickDesignSystem,
	FOUND_WORDS,
} from '../extension/src/designSystem';
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
		expect(await showFound(m, { root: fui.root, how: 'beside' }, async () => ({ ...fui }))).toBeNull();
		expect(m.add).not.toHaveBeenCalled();
		await showFound(m, { root: fui.root, how: 'beside' }, async () => ({ ...fui, branch: 'main' }));
		expect(m.add).toHaveBeenCalledWith({ ...fui, branch: 'main' });
	});

	it('says why, and tells the core nothing, when the folder cannot be read', async () => {
		const m = memory();
		const why = await showFound(m, { root: '/w/plain', how: 'chosen' }, async () => {
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
	storybookPath: '?path=/docs/buttons-fsbutton--docs',
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

	it('has its links from the catalog: its source always, its Storybook page once the address is known', () => {
		expect(componentLink(button, 'source')).toBe(button.source);
		expect(componentLink(button, 'storybook')).toBe(button.storybook);
		expect(() => componentLink({ ...button, storybook: null, storybookPath: null }, 'storybook')).toThrow(/its story file's title could not be read/);
	});
});

describe('a component opened in Storybook', () => {
	const system = { id: 'acme/ui', name: 'Acme' };
	const world = (answer: string | null) => ({
		ask: vi.fn(async () => answer),
		keep: vi.fn(),
		reread: vi.fn(async () => undefined),
		open: vi.fn(async () => undefined),
	});
	const unknown = { ...button, storybook: null };

	it('asks for its Storybook’s address once, keeps it with the design system, reads every page again, and opens the page', async () => {
		const d = world('https://sb.acme.test/');
		await openComponentLink(unknown, 'storybook', system, d);
		expect(d.ask).toHaveBeenCalledWith('Acme');
		expect(d.keep).toHaveBeenCalledWith('acme/ui', 'https://sb.acme.test/');
		expect(d.reread).toHaveBeenCalled();
		expect(d.open).toHaveBeenCalledWith('https://sb.acme.test/?path=/docs/buttons-fsbutton--docs');
	});

	it('asks nothing when the address is known, and keeps nothing when the person does not give one', async () => {
		const known = world('never asked');
		await openComponentLink(button, 'storybook', system, known);
		expect(known.ask).not.toHaveBeenCalled();
		expect(known.open).toHaveBeenCalledWith(button.storybook);
		const declined = world(null);
		await openComponentLink(unknown, 'storybook', system, declined);
		expect([declined.keep, declined.reread, declined.open].map((f) => f.mock.calls.length)).toEqual([0, 0, 0]);
	});

	it('takes only a web address, kept as its root with a closing /', async () => {
		const asked = (typed: string | undefined) => {
			const box = vi.fn(async (o: { validateInput?: (v: string) => string | null }) =>
				typed !== undefined && o.validateInput?.(typed) === null ? typed : undefined,
			);
			return { window: { showInputBox: box } as never, box };
		};
		expect(await askStorybook(asked('https://sb.acme.test/docs?x=1#y').window, 'Acme')).toBe('https://sb.acme.test/docs/');
		expect(await askStorybook(asked('ftp://sb.acme.test').window, 'Acme')).toBeNull();
		expect(await askStorybook(asked('not an address').window, 'Acme')).toBeNull();
		expect(await askStorybook(asked(undefined).window, 'Acme')).toBeNull();
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

describe('choosing the product’s design system', () => {
	const asked = (choose: (items: { label: string; pick: unknown }[]) => unknown) => {
		const showQuickPick = vi.fn(async (items: readonly { label: string; description?: string; pick: unknown }[], _options: unknown) =>
			choose([...items]),
		);
		return { window: { showQuickPick } as never, showQuickPick };
	};

	const system = (id: string, root: string, folder = '') => ({ id, name: id.toUpperCase(), repository: `acme/${id}`, root, folder, branch: 'main' });

	it('names the one in use as the tab does and where it came from, says what choosing clears, and offers the others, a folder and the product’s', async () => {
		const { window, showQuickPick } = asked((items) => items[0]);
		const known = {
			systems: [
				system('fui', '/w/fui'),
				system('acme', '/w/mono', 'packages/ui'),
				system('again', '/w/mono', 'packages/ui'),
				system('gone', '/w/gone'),
			],
			current: 'fui',
		};
		const exists = (dir: string) => dir !== '/w/gone';
		expect(await pickDesignSystem(window, { inUse: { root: '/w/fui', how: 'chosen' }, known, chosen: true, exists })).toEqual({
			kind: 'use',
			dir: '/w/mono/packages/ui',
		});
		const [items, options] = showQuickPick.mock.calls[0]!;
		// The one in use is not offered, one folder is offered once, and one no longer here not at all.
		expect(items.map((i) => [i.label, i.description])).toEqual([
			['ACME', '/w/mono/packages/ui'],
			['Choose a folder…', undefined],
			["Use the product's", 'the one its workspace file names'],
		]);
		expect(options).toMatchObject({
			title: 'Design system: FUI, chosen',
			placeHolder: expect.stringMatching(/^Choosing another clears what is being tried/),
		});
	});

	it('offers the product’s own only when another was chosen, and names one the tab does not show by its folder', async () => {
		const { window, showQuickPick } = asked((items) => items.find((i) => i.label === 'Choose a folder…'));
		const known = { systems: [], current: null };
		expect(await pickDesignSystem(window, { inUse: { root: '/w/plain', how: 'beside' }, known, chosen: false })).toEqual({ kind: 'folder' });
		const [items, options] = showQuickPick.mock.calls[0]!;
		expect(items.map((i) => i.label)).toEqual(['Choose a folder…']);
		expect(options).toMatchObject({ title: 'Design system: plain, beside the product' });
		const none = asked(() => undefined);
		expect(await pickDesignSystem(none.window, { inUse: null, known, chosen: true })).toBeNull();
		expect(none.showQuickPick.mock.calls[0]![1]).toMatchObject({ title: 'Design system: none in use' });
	});

	it('names each place a design system comes from in words', () => {
		expect(FOUND_WORDS).toEqual({ repository: 'in this repository', beside: 'beside the product', chosen: 'chosen', open: 'open in this window' });
	});
});

describe('a design system beside the product that could not be confirmed as its source', () => {
	const unconfirmed = {
		state: 'ask' as const,
		root: '/work/ui',
		why: '../ui has no release tag for 5.5.4, the version installed',
		key: 'k',
		name: '@flock/ui',
	};
	const asking = (answer: string | undefined) => {
		const offer = vi.fn(async (_message: string, _actions: string[]) => answer);
		const answers = { set: vi.fn() };
		return { offer, answers, asked: new Set<string>() };
	};

	it('is asked about once, saying why, and the answer is kept either way', async () => {
		const using = asking(USE_IT);
		expect(await askSource(using, unconfirmed)).toBe(true);
		expect(using.offer).toHaveBeenCalledWith(
			"The design system beside this product could not be confirmed as @flock/ui's source: ../ui has no release tag for 5.5.4, the version installed. Use it for prototypes and their guidance?",
			[USE_IT, NOT_THIS_ONE],
		);
		expect(using.answers.set).toHaveBeenCalledWith('k', 'use');
		expect(await askSource(using, unconfirmed)).toBe(false);
		expect(using.offer).toHaveBeenCalledTimes(1);
		const refusing = asking(NOT_THIS_ONE);
		await askSource(refusing, unconfirmed);
		expect(refusing.answers.set).toHaveBeenCalledWith('k', 'refuse');
	});

	it('keeps nothing when dismissed, and is not asked again in this window', async () => {
		const dismissed = asking(undefined);
		expect(await askSource(dismissed, unconfirmed)).toBe(false);
		expect(dismissed.answers.set).not.toHaveBeenCalled();
		await askSource(dismissed, unconfirmed);
		expect(dismissed.offer).toHaveBeenCalledTimes(1);
	});

	it('asks nothing of one that is usable, refused, or not there', async () => {
		const quiet = asking(USE_IT);
		for (const source of [
			{ state: 'usable' as const, root: '/u', how: 'beside' as const },
			{ state: 'refused' as const, root: '/u', why: 'no' },
			{ state: 'none' as const },
			null,
		])
			expect(await askSource(quiet, source)).toBe(false);
		expect(quiet.offer).not.toHaveBeenCalled();
	});
});
