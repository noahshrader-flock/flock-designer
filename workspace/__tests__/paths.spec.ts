import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PathOutsideCheckout, isInside, resolveInside } from '../src/main/services/paths';

let root: string;
let outside: string;

beforeAll(() => {
	const base = mkdtempSync(join(tmpdir(), 'fdw-paths-'));
	root = join(base, 'repo');
	outside = join(base, 'elsewhere');
	mkdirSync(join(root, 'src'), { recursive: true });
	mkdirSync(outside, { recursive: true });
	writeFileSync(join(root, 'src', 'a.txt'), 'a');
	writeFileSync(join(outside, 'secret.txt'), 'secret');
	symlinkSync(outside, join(root, 'escape'));
	symlinkSync(join(outside, 'secret.txt'), join(root, 'src', 'linked.txt'));
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

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
});

describe('resolveInside', () => {
	it('returns an absolute path for something inside', () => {
		expect(resolveInside(root, 'src/a.txt')).toMatch(/src\/a\.txt$/);
	});

	it('throws by name, so a caller can tell this apart from an IO error', () => {
		expect(() => resolveInside(root, '../elsewhere/secret.txt')).toThrow(PathOutsideCheckout);
	});
});
