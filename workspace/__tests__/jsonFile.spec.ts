import { chmodSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { jsonFile, writeAtomic } from '../src/core/services/jsonFile';

let dir: string;
beforeEach(() => (dir = mkdtempSync(join(tmpdir(), 'fd-json-'))));
afterEach(() => rmSync(dir, { recursive: true, force: true }));

/** A count kept in a file: anything else read is no count. */
const counter = (path: string) =>
	jsonFile(path, {
		parse: (u) => (typeof u === 'object' && u !== null && typeof (u as { n?: unknown }).n === 'number' ? (u as { n: number }) : { n: 0 }),
		fallback: { n: 0 },
	});

describe('a small JSON file', () => {
	it('reads what was written, in a folder made for it', () => {
		const file = counter(join(dir, 'deep', 'count.json'));
		expect(file.read()).toEqual({ n: 0 });
		file.write({ n: 3 });
		expect(file.read()).toEqual({ n: 3 });
	});

	it('is its fallback when missing, unreadable, or not what it should be', () => {
		const path = join(dir, 'count.json');
		writeFileSync(path, '{ not json');
		expect(counter(path).read()).toEqual({ n: 0 });
		writeFileSync(path, '{"n":"three"}');
		expect(counter(path).read()).toEqual({ n: 0 });
	});

	it('is its fallback when what it reads makes its check throw', () => {
		const path = join(dir, 'x.json');
		writeFileSync(path, '[]');
		const file = jsonFile(path, {
			parse: () => {
				throw new Error('no');
			},
			fallback: 'none',
		});
		expect(file.read()).toBe('none');
	});

	it('changes what is kept from what is there', () => {
		const file = counter(join(dir, 'count.json'));
		file.update((c) => ({ n: c.n + 1 }));
		file.update((c) => ({ n: c.n + 1 }));
		expect(file.read()).toEqual({ n: 2 });
	});

	it('is written whole: no part-written file, and nothing left beside it', () => {
		const file = counter(join(dir, 'count.json'));
		file.write({ n: 1 });
		expect(readdirSync(dir)).toEqual(['count.json']);
		expect(JSON.parse(readFileSync(join(dir, 'count.json'), 'utf8'))).toEqual({ n: 1 });
	});

	it('never throws when it cannot be written: not remembering is an inconvenience, never a failure', () => {
		chmodSync(dir, 0o500);
		try {
			expect(() => counter(join(dir, 'count.json')).write({ n: 1 })).not.toThrow();
		} finally {
			chmodSync(dir, 0o700);
		}
		expect(existsSync(join(dir, 'count.json'))).toBe(false);
	});
});

describe('writing a file whole', () => {
	it('keeps the mode it is given, for what only its owner may read', () => {
		writeAtomic(join(dir, 'secret'), 'x', 0o600);
		expect(statSync(join(dir, 'secret')).mode & 0o777).toBe(0o600);
	});
});
