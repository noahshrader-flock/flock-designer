import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isInside, resolveInside } from '../src/core/services/platform/paths';

let base: string;
let root: string;
let outside: string;

beforeAll(() => {
	base = mkdtempSync(join(tmpdir(), 'fdw-paths-'));
	root = join(base, 'repo');
	outside = join(base, 'elsewhere');
	mkdirSync(join(root, 'src'), { recursive: true });
	mkdirSync(outside, { recursive: true });
	writeFileSync(join(root, 'src', 'a.txt'), 'a');
	writeFileSync(join(outside, 'secret.txt'), 'secret');
	symlinkSync(outside, join(root, 'escape'));
	symlinkSync(join(outside, 'secret.txt'), join(root, 'src', 'linked.txt'));
});

afterAll(() => rmSync(base, { recursive: true, force: true }));

describe('isInside', () => {
	it('accepts a path within the checkout', () => {
		expect(isInside(root, 'src/a.txt')).toBe(true);
	});

	it('accepts the root itself', () => {
		expect(isInside(root, '.')).toBe(true);
	});

	it('accepts a file that does not exist yet, so new files can be written', () => {
		expect(isInside(root, 'src/not-written-yet.txt')).toBe(true);
	});

	it('rejects a traversal', () => {
		expect(isInside(root, '../elsewhere/secret.txt')).toBe(false);
	});

	it('rejects an absolute path somewhere else', () => {
		expect(isInside(root, join(outside, 'secret.txt'))).toBe(false);
	});

	it('rejects a symlinked FILE pointing out of the checkout', () => {
		// String comparison alone passes this one, which is why it is here.
		expect(isInside(root, 'src/linked.txt')).toBe(false);
	});

	it('rejects a path through a symlinked DIRECTORY pointing out of the checkout', () => {
		expect(isInside(root, 'escape/secret.txt')).toBe(false);
	});

	it('rejects a file not written yet through a symlinked DIRECTORY pointing out, where it would be written', () => {
		expect(isInside(root, 'escape/new.txt')).toBe(false);
		expect(isInside(root, 'escape/deeper/new.txt')).toBe(false);
	});

	it('accepts a file not written yet in a folder not made yet, inside', () => {
		expect(isInside(root, 'src/new-folder/new.txt')).toBe(true);
	});
});

describe('resolveInside', () => {
	it('returns an absolute path for something inside', () => {
		expect(resolveInside(root, 'src/a.txt')).toMatch(/src\/a\.txt$/);
	});

	it('says it refused, and where the repository is, rather than failing as a missing file would', () => {
		expect(() => resolveInside(root, '../elsewhere/secret.txt')).toThrow(/^Refused: .* is outside the opened repository/);
	});
});
