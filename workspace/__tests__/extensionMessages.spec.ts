import { describe, expect, it } from 'vitest';
import { readComponentArg, readMessage, readProjectArg, readReview } from '../extension/src/messages';

/**
 * What the panel's page may ask of the extension (Phase 3): a call to the core by its name in the contract's table, or
 * one of the panel's own few requests, each in exactly its shape, as the app checks what its window sends. Anything else
 * is dropped.
 */

describe('a message from the panel', () => {
	it.each([
		[{ type: 'call', id: 1, name: 'listProjects', args: [] }],
		[{ type: 'call', id: 7, name: 'readCheckout', args: ['/a', 2] }],
		[{ type: 'ready' }],
		[{ type: 'locate-design-system' }],
		[{ type: 'get-started' }],
		[{ type: 'ask-new-prototype' }],
		[{ type: 'codebase', action: 'hand-off', projectId: 'zone-coverage' }],
		// The draft pull request, from the Hand off dialog once a handoff found the work ready.
		[{ type: 'codebase', action: 'share', projectId: 'zone-coverage' }],
		[{ type: 'codebase', action: 'open-code', projectId: 'zone-coverage' }],
		[{ type: 'codebase', action: 'run-locally', projectId: 'zone-coverage' }],
		[{ type: 'new-prototype', title: 'Alert history', task: 'A history of alerts.', folder: null }],
		[{ type: 'new-prototype', title: 'Alert history', task: 'A history of alerts.', folder: 'Maps' }],
		[{ type: 'open-review', projectId: 'alert-history', name: 'v2-i1', title: 'Alert history · V2 · I1' }],
		[{ type: 'open-review-in-browser', projectId: 'alert-history', name: 'v2-i1', title: 'Alert history · V2 · I1' }],
		[{ type: 'copy-review-link', projectId: 'alert-history', name: 'v2-i1', title: 'Alert history · V2 · I1' }],
		[{ type: 'open-review-published', projectId: 'alert-history', name: 'v2-i1', title: 'Alert history · V2 · I1' }],
		// The Design System tab's (6.1 to 6.3): a component's tab, its links, Primitives, the voice and tone, a token's file, the change tried.
		[{ type: 'open-component', id: 'src/components/FSButton/FSButton.stories.tsx' }],
		[{ type: 'component-link', id: 'src/components/FSButton/FSButton.stories.tsx', link: 'storybook' }],
		[{ type: 'component-link', id: 'src/components/FSButton/FSButton.stories.tsx', link: 'source' }],
		[{ type: 'open-primitives' }],
		[{ type: 'open-voice-and-tone' }],
		[{ type: 'open-library-source', file: 'src/colors/theme/light.ts', line: 12 }],
		[{ type: 'token-edits', edits: [] }],
		[{ type: 'token-edits', edits: [{ path: 'palette.light.primary.main', value: '#112233' }] }],
		[{ type: 'set-mode', mode: 'dark' }],
		[{ type: 'set-mode', mode: 'light' }],
		[{ type: 'value-trial', file: 'src/a.stories.tsx', commit: 'abc123', values: [] }],
		[{ type: 'value-trial', file: 'src/a.stories.tsx', commit: 'abc123', values: [{ property: 'height', value: '32px', targets: ['a'] }] }],
		[{ type: 'open-changes' }],
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
		[{ type: 'sign-in' }],
		[{ type: 'account' }],
		[{ type: 'open-review', projectId: 'a', name: 'v1-i1' }],
		[{ type: 'open-review-in-browser', projectId: 'a', name: 'v1-i1' }],
		[{ type: 'copy-review-link', projectId: 'a', name: 'v1-i1' }],
		[{ type: 'copy-review-link', projectId: '../a', name: 'v1-i1', title: 'x' }],
		[{ type: 'open-review-published', projectId: '../a', name: 'v1-i1', title: 'x' }],
		// Removed: the panel no longer asks for a code preview.
		[{ type: 'codebase', action: 'preview', projectId: 'zone-coverage' }],
		[{ type: 'open-review-in-browser', projectId: 'a', name: 'v1-i1', title: 'x'.repeat(301) }],
		[{ type: 'open-review', projectId: 1, name: 'v1-i1', title: 't' }],
		[{ type: 'open-review', projectId: 'a', name: 'v1-i1', title: 'x'.repeat(301) }],
		// A review is of a project, by its id, and a prototype, by its name: nothing that would be a path to something else.
		[{ type: 'open-review', projectId: 'a/../../previews-x', name: 'v1-i1', title: 't' }],
		[{ type: 'open-review', projectId: 'a', name: '../../x', title: 't' }],
		[{ type: 'new-prototype' }],
		[{ type: 'new-prototype', title: 'A', task: 'B' }],
		[{ type: 'new-prototype', title: 1, task: 'B', folder: null }],
		[{ type: 'new-prototype', title: 'A', task: 'x'.repeat(4001), folder: null }],
		[{ type: 'new-prototype', title: 'x'.repeat(301), task: 'B', folder: null }],
		[{ type: 'new-prototype', title: 'A', task: 'B', folder: 'x'.repeat(101) }],
		[{ type: 'new-prototype', title: 'A', task: 'B', folder: null, more: 1 }],
		[{ type: 'codebase', action: 'push', projectId: 'zone-coverage' }],
		[{ type: 'codebase', action: 'preview', projectId: '../etc' }],
		[{ type: 'codebase', action: 'preview' }],
		[{ type: 'codebase', action: 'open-code', projectId: 'zone-coverage', url: 'https://evil.example' }],
		[{ type: 'run', command: 'rm -rf /' }],
		[{ type: 'open-component' }],
		[{ type: 'open-component', id: '' }],
		[{ type: 'open-component', id: 'x'.repeat(501) }],
		[{ type: 'component-link', id: 'a.stories.tsx', link: 'https://evil.example' }],
		[{ type: 'component-link', id: 'a.stories.tsx', link: 'source', url: 'https://evil.example' }],
		[{ type: 'open-library-source', file: 'a.ts', line: 0 }],
		[{ type: 'open-library-source', file: 'a.ts', line: 1.5 }],
		[{ type: 'open-library-source', file: '', line: 1 }],
		[{ type: 'token-edits', edits: 'all' }],
		[{ type: 'token-edits', edits: new Array(501).fill({ path: 'a', value: '#000000' }) }],
		[{ type: 'open-primitives', which: 'all' }],
		[{ type: 'set-mode', mode: 'sepia' }],
		[{ type: 'set-mode' }],
		[{ type: 'set-mode', mode: 'dark', also: 1 }],
		[{ type: 'value-trial', file: 'src/a.stories.tsx', commit: 'not a commit', values: [] }],
		[{ type: 'value-trial', file: '', commit: 'abc123', values: [] }],
		[{ type: 'value-trial', file: 'src/a.stories.tsx', commit: 'abc123', values: 'all' }],
		[{ type: 'value-trial', file: 'src/a.stories.tsx', commit: 'abc123', values: new Array(51).fill({}) }],
		[{ type: 'open-changes', which: 'all' }],
	])('%o is dropped', (m) => {
		expect(readMessage(m)).toBeNull();
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
		expect(readReview({ projectId: 'a', name: 'v1-i1', title: 'A · V1 · I1' })).toEqual({ projectId: 'a', name: 'v1-i1', title: 'A · V1 · I1' });
		expect(readReview({ projectId: 'a', name: 'v1-i1' })).toBeNull();
		expect(readReview({ projectId: 'a', name: 'v1-i1', title: 'x', type: 'call' })).toBeNull();
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
