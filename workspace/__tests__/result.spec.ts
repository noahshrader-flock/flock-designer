import { describe, expect, it } from 'vitest';
import { errorText, fail, ok, toResult } from '../src/shared/result';
import { isCommit, isObjectId } from '../src/shared/sha';

describe('what a call answers with', () => {
	it('is the value, or what went wrong as a person reads it', async () => {
		expect(ok(3)).toEqual({ ok: true, value: 3 });
		expect(fail(new Error('No such branch.'))).toEqual({ ok: false, error: 'No such branch.' });
		expect(fail('plain')).toEqual({ ok: false, error: 'plain' });
		expect(await toResult(Promise.reject(new Error('gone')))).toEqual({ ok: false, error: 'gone' });
		expect(await toResult(Promise.resolve('here'))).toEqual({ ok: true, value: 'here' });
	});

	it('keeps only the first line of a message that runs on, when asked', () => {
		expect(errorText(new Error('  fatal: not a repository\nhint: run git init\n'), { firstLine: true })).toBe('fatal: not a repository');
		expect(errorText(new Error('a\nb'))).toBe('a\nb');
	});
});

describe("git's names", () => {
	it('takes a commit abbreviated or whole, SHA-256 included, and nothing else', () => {
		for (const ok7 of ['abc1234', 'a'.repeat(40), 'b'.repeat(64)]) expect(isCommit(ok7)).toBe(true);
		for (const bad of ['abc123', 'ABC1234', 'g'.repeat(7), 'a'.repeat(65), '', 7, null]) expect(isCommit(bad)).toBe(false);
	});

	it('takes an object only by its whole name', () => {
		expect(isObjectId('a'.repeat(40))).toBe(true);
		expect(isObjectId('a'.repeat(64))).toBe(true);
		for (const bad of ['a'.repeat(39), 'a'.repeat(41), 'a'.repeat(63), 'abc1234']) expect(isObjectId(bad)).toBe(false);
	});
});
