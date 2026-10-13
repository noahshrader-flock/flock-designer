import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }));
const { arg } = await import('../src/main/handle');

/** What the window sent, through the check `check`: its value, or the sentence it was refused with. */
const through = <T>(check: (v: unknown) => T, sent: unknown): T | string => {
	try {
		return check(sent);
	} catch (err) {
		return (err as Error).message;
	}
};

describe('what the window sends, checked', () => {
	it('takes a comment by its thread and its number, and nothing else', () => {
		expect(through(arg.comment, { thread: 4, id: 3 })).toEqual({ thread: 4, id: 3 });
		for (const sent of [3, { id: 3 }, { thread: 4, id: 0 }, { thread: -1, id: 3 }, { thread: 4, id: '3' }, null])
			expect(through(arg.comment, sent)).toBe('That is not a comment.');
		// A pin on the page is its comment's number alone: the page knows nothing of threads.
		expect(through(arg.markerId, 3)).toBe(3);
	});

	it("takes an iteration's name, a prototype's or codebase, and a prototype's only where one is meant", () => {
		for (const name of ['codebase', 'v2-i3', 'i1']) expect(through(arg.iterationName, name)).toBe(name);
		expect(through(arg.iterationName, 'feature/x')).toBe('"feature/x" is not an iteration.');
		expect(through(arg.prototypeName, 'v1-i1')).toBe('v1-i1');
		expect(through(arg.prototypeName, 'codebase')).toBe('"codebase" is not a prototype.');
		expect(through(arg.prototypeName, 5)).toBe('That is not a prototype.');
	});

	it('says yes only for true', () => {
		expect([true, 'true', 1, undefined].map((v) => arg.flag(v))).toEqual([true, false, false, false]);
	});

	it('takes nothing as null where a value is optional, and still checks one that is sent', () => {
		const branch = arg.optional(arg.branch);
		expect([branch(undefined), branch(null), branch('develop')]).toEqual([null, null, 'develop']);
		expect(through(branch, '--upload-pack=x')).toBe('"--upload-pack=x" is not a branch name.');
	});

	it('takes a starting point as a folder and a branch in it, or none', () => {
		expect(arg.startingPoint(null)).toBeNull();
		expect(arg.startingPoint({ root: '/c/coke', branch: 'develop' })).toEqual({ root: '/c/coke', branch: 'develop' });
		expect(through(arg.startingPoint, { root: '/c/coke', branch: '--upload-pack=x' })).toBe('"--upload-pack=x" is not a branch name.');
		expect(through(arg.startingPoint, { root: 5, branch: 'develop' })).toBe('That is not a folder (up to 4,096 characters).');
	});

	it("bounds a person's words, and says how far", () => {
		expect(through(arg.words, 'x'.repeat(20_001))).toBe('That is not text (up to 20,000 characters).');
		expect(through(arg.name, 'x'.repeat(301))).toBe('That is not a name.');
	});
});
