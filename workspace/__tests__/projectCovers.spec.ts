import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { contentHashOf } from '../src/main/services/prototype';
import { memoryStore, type Fn } from './fixtures';
import { type CoverDeps, builtHere, ensureCovers, isBlank } from '../src/main/services/projectCovers';
import { coverPath } from '../src/shared/designPaths';

/**
 * The picture of each prototype on its project's card: one reconcile step that makes sure every prototype built on this
 * machine has a current picture. A picture is a file in the design repository, and the prototype's record says which
 * (`cover`, the hash of the page it was drawn from). File first, record second, so a record never points at nothing.
 */

const record = (name: string, more: Record<string, unknown> = {}) => ({
	projectId: 'demo',
	name,
	branch: `prototype/demo/${name}`,
	commit: null,
	createdAt: '2026-10-10T00:00:00Z',
	note: '',
	...more,
});
const records = (...r: unknown[]) => `${JSON.stringify(r, null, 2)}\n`;
const RECORDS = 'projects/demo/work.json';
const PAGE = '<h1>Demo</h1>';
const HASH = contentHashOf(PAGE);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const coverOf = (files: Record<string, string | Buffer>, name: string) =>
	(JSON.parse(String(files[RECORDS])) as Array<Record<string, unknown>>).find((r) => r.name === name)?.cover;

let deps: CoverDeps & { draw: Fn; serve: Fn };
let mem: ReturnType<typeof memoryStore>;
let pages: Record<string, string>;
beforeEach(() => {
	mem = memoryStore({ [RECORDS]: records(record('v1')) });
	pages = { 'demo/v1': PAGE };
	deps = {
		store: () => mem.store,
		page: (projectId, name) => pages[`${projectId}/${name}`] ?? null,
		serve: vi.fn(async (projectId: string, name: string) => `http://127.0.0.1:1/${projectId}/${name}/`),
		draw: vi.fn(async () => JPEG),
		tried: new Set(),
	};
});
const built = (...names: string[]) => names.map((name) => ({ projectId: 'demo', name }));

describe('ensureCovers', () => {
	it('draws a prototype built here, writes its picture, then says so on its record', async () => {
		const made = await ensureCovers(deps, built('v1'));
		expect(made).toEqual([{ projectId: 'demo', name: 'v1', cover: HASH }]);
		expect(deps.draw).toHaveBeenCalledWith('http://127.0.0.1:1/demo/v1/');
		expect(mem.files[coverPath('demo', 'v1', HASH)]).toEqual(JPEG);
		expect(coverOf(mem.files, 'v1')).toBe(HASH);
		// File first, record second: a record never points at a picture that is not there.
		expect(mem.writes).toEqual([coverPath('demo', 'v1', HASH), RECORDS]);
	});

	it('is a picture of the page as it is: the page’s hash is the record’s, and the file is named by it', () => {
		expect(coverPath('demo', 'v1', HASH)).toBe(`projects/demo/covers/v1-${HASH}.jpg`);
	});

	it('does nothing the second time: a record whose cover is the page’s hash is current', async () => {
		await ensureCovers(deps, built('v1'));
		const writes = mem.writes.length;
		expect(await ensureCovers({ ...deps, tried: new Set() }, built('v1'))).toEqual([]);
		expect(deps.draw).toHaveBeenCalledTimes(1);
		expect(mem.writes).toHaveLength(writes);
	});

	it('draws again when the page changes, and keeps the other fields of the record', async () => {
		mem.files[RECORDS] = records(record('v1', { cover: 'aaaaaaaaaaaa', previewUrl: 'https://x.test' }));
		const [made] = await ensureCovers(deps, built('v1'));
		expect(made?.cover).toBe(HASH);
		const kept = (JSON.parse(String(mem.files[RECORDS])) as Array<Record<string, unknown>>)[0];
		expect(kept).toMatchObject({ name: 'v1', cover: HASH, previewUrl: 'https://x.test', branch: 'prototype/demo/v1' });
	});

	it('keeps every prototype’s picture: drawing one never touches another’s', async () => {
		mem.files[RECORDS] = records(record('v1', { cover: 'aaaaaaaaaaaa' }), record('v12'));
		mem.files[coverPath('demo', 'v1', 'aaaaaaaaaaaa')] = JPEG;
		pages = { 'demo/v12': '<h1>Two</h1>' };
		await ensureCovers(deps, built('v12'));
		expect(coverOf(mem.files, 'v1')).toBe('aaaaaaaaaaaa');
		expect(mem.files[coverPath('demo', 'v1', 'aaaaaaaaaaaa')]).toEqual(JPEG);
		expect(coverOf(mem.files, 'v12')).toBe(contentHashOf('<h1>Two</h1>'));
	});

	it('draws nothing for a page that was not built here, or a prototype with no record', async () => {
		pages = {};
		expect(await ensureCovers(deps, built('v1'))).toEqual([]);
		pages = { 'demo/v9': PAGE };
		expect(await ensureCovers(deps, built('v9'))).toEqual([]);
		expect(deps.draw).not.toHaveBeenCalled();
		expect(mem.writes).toEqual([]);
	});

	it('leaves nothing when the drawing fails, and does not try that page again this session', async () => {
		deps.draw.mockResolvedValueOnce(null).mockRejectedValueOnce(new Error('no window'));
		expect(await ensureCovers(deps, built('v1'))).toEqual([]);
		expect(mem.writes).toEqual([]);
		expect(coverOf(mem.files, 'v1')).toBeUndefined();
		expect(await ensureCovers(deps, built('v1'))).toEqual([]);
		expect(deps.draw).toHaveBeenCalledTimes(1);
		// A failure that throws is no picture either, for a page not tried yet.
		pages['demo/v1'] = '<h1>Changed</h1>';
		expect(await ensureCovers(deps, built('v1'))).toEqual([]);
		expect(mem.writes).toEqual([]);
	});

	it('never writes over a picture that is there: it only says so on the record', async () => {
		mem.files[coverPath('demo', 'v1', HASH)] = Buffer.from('already');
		await ensureCovers(deps, built('v1'));
		expect(mem.files[coverPath('demo', 'v1', HASH)]).toEqual(Buffer.from('already'));
		expect(mem.writes).toEqual([RECORDS]);
	});

	it('draws one page at a time, in order', async () => {
		mem.files[RECORDS] = records(record('v1'), record('v2'));
		pages['demo/v2'] = '<h1>Two</h1>';
		let open = 0;
		let most = 0;
		deps.draw.mockImplementation(async () => {
			most = Math.max(most, ++open);
			await new Promise((r) => setTimeout(r, 5));
			open--;
			return JPEG;
		});
		expect((await ensureCovers(deps, built('v1', 'v2'))).map((m) => m.name)).toEqual(['v1', 'v2']);
		expect(most).toBe(1);
	});

	it('skips a project whose records cannot be read, and goes on to the next', async () => {
		mem.files['projects/other/work.json'] = '{not json';
		const made = await ensureCovers(deps, [{ projectId: 'other', name: 'v1' }, ...built('v1')]);
		expect(made.map((m) => m.projectId)).toEqual(['demo']);
	});
});

describe('builtHere', () => {
	let root: string;
	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'fd-covers-'));
	});
	afterEach(() => rmSync(root, { recursive: true, force: true }));

	it('is every prototype page in the app’s own prototype folder, and nothing else in it', () => {
		mkdirSync(join(root, 'demo'), { recursive: true });
		mkdirSync(join(root, '_shared'), { recursive: true });
		mkdirSync(join(root, '_site', 'demo'), { recursive: true });
		for (const f of ['v1.html', 'v2.html', 'v1.tsx', 'v1-into-code.md', 'notes.html']) writeFileSync(join(root, 'demo', f), 'x');
		writeFileSync(join(root, '_shared', 'v1.html'), 'x');
		writeFileSync(join(root, 'stray.html'), 'x');
		expect(builtHere(root)).toEqual([
			{ projectId: 'demo', name: 'v1' },
			{ projectId: 'demo', name: 'v2' },
		]);
	});

	it('is nothing when the folder is not there', () => {
		expect(builtHere(join(root, 'none'))).toEqual([]);
	});
});

describe('isBlank', () => {
	/** A bitmap of `n` pixels, 4 bytes each, of one color, with `odd` of them another. */
	const bitmap = (n: number, odd = 0, color = [0xff, 0xff, 0xff, 0xff], other = [0x20, 0x30, 0x40, 0xff]) => {
		const data = Buffer.alloc(n * 4);
		for (let i = 0; i < n; i++) data.set(i < odd ? other : color, i * 4);
		return data;
	};

	it('is a capture of one color: a page that painted nothing, in white or in any other color', () => {
		expect(isBlank(bitmap(10_000))).toBe(true);
		expect(isBlank(bitmap(10_000, 0, [0x10, 0x10, 0x10, 0xff]))).toBe(true);
	});

	it('is not a capture with something on it, even a little', () => {
		expect(isBlank(bitmap(10_000, 300))).toBe(false);
	});

	it('takes a color a step off as the same one, as a JPEG or a gradient edge would leave it', () => {
		const data = bitmap(10_000);
		for (let i = 0; i < 10_000; i += 7) data[i * 4] = 0xfd;
		expect(isBlank(data)).toBe(true);
	});

	it('is blank when there is nothing in it at all', () => {
		expect(isBlank(Buffer.alloc(0))).toBe(true);
	});
});
