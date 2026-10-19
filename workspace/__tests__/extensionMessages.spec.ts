import { describe, expect, it } from 'vitest';
import { type AskHandlers, askRoutes, readComponentArg, readReview } from '../extension/src/asks';
import { ASKS, type AskName, readMessage, readProjectArg } from '../extension/src/messages';

/**
 * What a DSNR page may send the extension: that it listens, or a call by its name, the core's or one of the extension's
 * own asks (`PageAsks`), each ask's arguments checked as the core checks a call's, before anything is done. Anything else
 * is dropped, or refused, in words.
 */

describe('a message from a page', () => {
	it.each([
		[{ type: 'call', id: 1, name: 'listProjects', args: [] }],
		[{ type: 'call', id: 7, name: 'readCheckout', args: ['/a', 2] }],
		[{ type: 'call', id: 8, name: 'openComponent', args: ['x'] }],
		[{ type: 'ready' }],
	])('%o is read', (m) => {
		expect(readMessage(m)).toEqual(m);
	});

	it.each([
		[null],
		['ready'],
		[{}],
		[{ type: 'call', id: 1, name: 'runAnything', args: [] }],
		[{ type: 'call', id: 0, name: 'listProjects', args: [] }],
		[{ type: 'call', id: 1.5, name: 'listProjects', args: [] }],
		[{ type: 'call', id: '1', name: 'listProjects', args: [] }],
		[{ type: 'call', id: 1, name: 'listProjects', args: 'x' }],
		[{ type: 'call', id: 1, name: 'listProjects', args: [], extra: true }],
		[{ type: 'ready', as: 'someone' }],
		// Signing in is VS Code's own, from the title bar: the page cannot ask for it.
		[{ type: 'call', id: 1, name: 'signIn', args: [] }],
		// Only the calls, by name: a message of its own is not one any more.
		[{ type: 'open-component', id: 'a' }],
		[{ type: 'run', command: 'rm -rf /' }],
	])('%o is dropped', (m) => {
		expect(readMessage(m)).toBeNull();
	});
});

/** Every ask answered by a stand-in that says what it was given. */
const handled = () => {
	const given: [string, unknown[]][] = [];
	const handlers = Object.fromEntries(ASKS.map((name) => [name, (...args: unknown[]) => void given.push([name, args])])) as unknown as AskHandlers;
	return { routes: askRoutes(handlers), given };
};

describe('an ask from a page', () => {
	it.each([
		['locateDesignSystem', []],
		['getStarted', []],
		['askNewPrototype', []],
		['codebase', ['hand-off', 'zone-coverage']],
		// The draft pull request, from the Hand off dialog once a handoff found the work ready.
		['codebase', ['share', 'zone-coverage']],
		['codebase', ['open-code', 'zone-coverage']],
		['codebase', ['run-locally', 'zone-coverage']],
		['newPrototype', ['Alert history', 'A history of alerts.', null]],
		['newPrototype', ['Alert history', 'A history of alerts.', 'Maps']],
		['openReview', [{ projectId: 'alert-history', name: 'v2', title: 'Alert history · Version 2' }]],
		['openReviewInBrowser', [{ projectId: 'alert-history', name: 'v2', title: 'Alert history · Version 2' }]],
		['copyReviewLink', [{ projectId: 'alert-history', name: 'v2', title: 'Alert history · Version 2' }]],
		['openReviewPublished', [{ projectId: 'alert-history', name: 'v2', title: 'Alert history · Version 2' }]],
		// The Design System tab's (6.1 to 6.3): a component's tab, its links, Primitives, the voice and tone, a token's file, the change tried.
		['openComponent', ['src/components/FSButton/FSButton.stories.tsx']],
		['componentLink', ['src/components/FSButton/FSButton.stories.tsx', 'storybook']],
		['componentLink', ['src/components/FSButton/FSButton.stories.tsx', 'source']],
		['openPrimitives', []],
		['openVoiceAndTone', []],
		['openLibrarySource', ['src/colors/theme/light.ts', 12]],
		['setTokenEdits', [[]]],
		['setTokenEdits', [[{ path: 'palette.light.primary.main', value: '#112233' }]]],
		['setMode', ['dark']],
		['setMode', ['light']],
		['setValueTrial', ['src/a.stories.tsx', 'abc123', []]],
		['setValueTrial', ['src/a.stories.tsx', 'abc123', [{ property: 'height', value: '32px', targets: ['a'] }]]],
		['openChanges', []],
		['syncDesignSystem', []],
	] as [AskName, unknown[]][])('%s %o is done', async (name, args) => {
		const { routes, given } = handled();
		expect(await routes.get(name)?.(...args)).toEqual({ ok: true, value: null });
		expect(given).toEqual([[name, args]]);
	});

	it.each([
		['openReview', [{ projectId: 'a', name: 'v1' }]],
		['openReviewInBrowser', [{ projectId: 'a', name: 'v1' }]],
		['copyReviewLink', [{ projectId: '../a', name: 'v1', title: 'x' }]],
		['openReviewPublished', [{ projectId: '../a', name: 'v1', title: 'x' }]],
		['openReviewInBrowser', [{ projectId: 'a', name: 'v1', title: 'x'.repeat(301) }]],
		['openReview', [{ projectId: 1, name: 'v1', title: 't' }]],
		// A review is of a project, by its id, and a prototype, by its name: nothing that would be a path to something else.
		['openReview', [{ projectId: 'a/../../previews-x', name: 'v1', title: 't' }]],
		['openReview', [{ projectId: 'a', name: '../../x', title: 't' }]],
		['openReview', [{ projectId: 'a', name: 'v1', title: 't', more: 1 }]],
		['newPrototype', [1, 'B', null]],
		['newPrototype', ['A', 'x'.repeat(4001), null]],
		['newPrototype', ['x'.repeat(301), 'B', null]],
		['newPrototype', ['A', 'B', 'x'.repeat(101)]],
		// Removed: the panel no longer asks for a code preview.
		['codebase', ['preview', 'zone-coverage']],
		['codebase', ['push', 'zone-coverage']],
		['codebase', ['open-code', '../etc']],
		['openComponent', [undefined]],
		['openComponent', ['']],
		['openComponent', ['x'.repeat(501)]],
		['componentLink', ['a.stories.tsx', 'https://evil.example']],
		['openLibrarySource', ['a.ts', 0]],
		['openLibrarySource', ['a.ts', 1.5]],
		['openLibrarySource', ['', 1]],
		['setTokenEdits', ['all']],
		['setTokenEdits', [new Array(501).fill({ path: 'a', value: '#000000' })]],
		['setMode', ['sepia']],
		['setMode', [undefined]],
		['setValueTrial', ['src/a.stories.tsx', 'not a commit', []]],
		['setValueTrial', ['', 'abc123', []]],
		['setValueTrial', ['src/a.stories.tsx', 'abc123', 'all']],
		['setValueTrial', ['src/a.stories.tsx', 'abc123', new Array(51).fill({})]],
	] as [AskName, unknown[]][])('%s %o is refused, and nothing is done', async (name, args) => {
		const { routes, given } = handled();
		expect((await routes.get(name)?.(...args))?.ok).toBe(false);
		expect(given).toEqual([]);
	});
});

describe('a component a command is given', () => {
	it('is its story file, read as the panel’s is, or nothing', () => {
		expect(readComponentArg({ id: 'src/FSButton.stories.tsx' })).toBe('src/FSButton.stories.tsx');
		expect(readComponentArg({ id: '' })).toBeNull();
		expect(readComponentArg({ id: 'a', more: 1 })).toBeNull();
		expect(readComponentArg('src/FSButton.stories.tsx')).toBeNull();
		expect(readComponentArg({ type: 'open-component', id: 'a' })).toBeNull();
	});
});

describe('a review a command is given', () => {
	it('is read as the panel’s is, in exactly its shape', () => {
		expect(readReview({ projectId: 'a', name: 'v1', title: 'A · Version 1' })).toEqual({ projectId: 'a', name: 'v1', title: 'A · Version 1' });
		expect(readReview({ projectId: 'a', name: 'v1' })).toBeNull();
		expect(readReview({ projectId: 'a', name: 'v1', title: 'x', type: 'call' })).toBeNull();
		expect(readReview('a')).toBeNull();
	});
});

describe('a project a command is given', () => {
	it('is a row’s context, from its right-click menu, or nothing', () => {
		expect(readProjectArg({ webviewSection: 'project', projectId: 'demo', preventDefaultContextMenuItems: true })).toBe('demo');
		expect(readProjectArg(undefined)).toBeNull();
		expect(readProjectArg({ projectId: 3 })).toBeNull();
		expect(readProjectArg({ projectId: '../etc' })).toBeNull();
	});
});
