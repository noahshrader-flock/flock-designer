import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { OpenedCheckouts } from '../src/main/services/session';

let a: string;
let b: string;

beforeEach(() => {
	a = mkdtempSync(join(tmpdir(), 'fdw-sess-a-'));
	b = mkdtempSync(join(tmpdir(), 'fdw-sess-b-'));
});
afterEach(() => {
	rmSync(a, { recursive: true, force: true });
	rmSync(b, { recursive: true, force: true });
});

describe('OpenedCheckouts', () => {
	it('refuses a root the designer never opened', () => {
		const opened = new OpenedCheckouts();
		expect(() => opened.require(a)).toThrow(/not open in this window/);
	});

	it('allows a root after it is opened', () => {
		const opened = new OpenedCheckouts();
		opened.remember(a);
		expect(opened.require(a)).toBeTruthy();
		expect(opened.has(a)).toBe(true);
	});

	it('does not leak one opened root into another', () => {
		const opened = new OpenedCheckouts();
		opened.remember(a);
		expect(() => opened.require(b)).toThrow();
	});

	it('is not fooled by a different spelling of the same path', () => {
		const opened = new OpenedCheckouts();
		opened.remember(a);
		expect(opened.has(join(a, '.', ''))).toBe(true);
		expect(opened.has(join(a, 'sub', '..'))).toBe(true);
	});

	it('refuses a child of an opened root, which is a different repository', () => {
		const opened = new OpenedCheckouts();
		opened.remember(a);
		expect(opened.has(join(a, 'sub'))).toBe(false);
	});
});
