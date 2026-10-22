import { describe, expect, it } from 'vitest';
import { mergeWorkRecords, parseWork, serializeWork, toPrototypeWork } from '../src/shared/workRecords';

const rec = (name: string, extra: Record<string, unknown> = {}) => ({
	prototypeId: 'p',
	name,
	branch: `prototype/p/${name}`,
	commit: null,
	createdAt: '2026-10-01T00:00:00Z',
	...extra,
});
const text = (...r: unknown[]) => JSON.stringify(r, null, 2);
const names = (json: string | null) => (JSON.parse(json as string) as Array<{ name: string }>).map((r) => r.name);
const find = (json: string | null, name: string) =>
	(JSON.parse(json as string) as Array<Record<string, unknown>>).find((r) => r.name === name) as Record<string, unknown>;

describe('mergeWorkRecords', () => {
	it('keeps every record either side knows, in order', () => {
		expect(names(mergeWorkRecords(text(rec('v1'), rec('v3')), text(rec('v1'), rec('v2'))))).toEqual(['v1', 'v2', 'v3']);
	});

	it('sorts v10 after v9, not after v1', () => {
		expect(names(mergeWorkRecords(text(rec('v10')), text(rec('v9'), rec('v2'))))).toEqual(['v2', 'v9', 'v10']);
	});

	it("prefers this machine's value where both have one", () => {
		expect(find(mergeWorkRecords(text(rec('v1', { commit: 'mine' })), text(rec('v1', { commit: 'theirs' }))), 'v1').commit).toBe('mine');
	});

	it("does not let this machine's missing value blank one the other side has", () => {
		const merged = mergeWorkRecords(text(rec('v1', { commit: null })), text(rec('v1', { commit: 'abc', previewUrl: 'https://x.test' })));
		expect(find(merged, 'v1')).toMatchObject({ commit: 'abc', previewUrl: 'https://x.test' });
	});

	it('keeps a prototype’s picture across machines: this machine’s when it has one, never blanked by one that has none', () => {
		const newer = mergeWorkRecords(text(rec('v1', { cover: 'bbbbbbbbbbbb' })), text(rec('v1', { cover: 'aaaaaaaaaaaa' })));
		expect(find(newer, 'v1').cover).toBe('bbbbbbbbbbbb');
		const kept = mergeWorkRecords(text(rec('v1')), text(rec('v1', { cover: 'aaaaaaaaaaaa' })));
		expect(find(kept, 'v1').cover).toBe('aaaaaaaaaaaa');
	});

	it('keeps the earliest start date, so merging never makes work look newer', () => {
		const merged = mergeWorkRecords(text(rec('v1', { createdAt: '2026-10-05T00:00:00Z' })), text(rec('v1', { createdAt: '2026-09-28T00:00:00Z' })));
		expect(find(merged, 'v1').createdAt).toBe('2026-09-28T00:00:00Z');
	});

	it('combines contributors from both sides without repeating anyone', () => {
		const merged = mergeWorkRecords(
			text(rec('v1', { contributors: [{ name: 'Ada', login: 'ada' }] })),
			text(
				rec('v1', {
					contributors: [
						{ name: 'Ada', login: 'ada' },
						{ name: 'Grace', login: null },
					],
				}),
			),
		);
		expect((find(merged, 'v1').contributors as Array<{ name: string }>).map((p) => p.name).sort()).toEqual(['Ada', 'Grace']);
	});

	it('keeps fields it does not know about, so a newer app version does not lose data to an older one', () => {
		expect(find(mergeWorkRecords(text(rec('v1')), text(rec('v1', { somethingNew: 7 }))), 'v1').somethingNew).toBe(7);
	});

	it('ends with a newline, as the file always has, so a merge does not make a spurious diff', () => {
		expect(mergeWorkRecords(text(rec('v1')), text(rec('v1')))?.endsWith('\n')).toBe(true);
	});

	it.each([
		['not json', 'nope', text(rec('v1'))],
		['not a list', '{"a":1}', text(rec('v1'))],
		['entries without a name', '[{"branch":"x"}]', text(rec('v1'))],
		['the other side broken', text(rec('v1')), '[{'],
	])('gives up, rather than guess, when %s', (_label, a, b) => {
		expect(mergeWorkRecords(a, b)).toBeNull();
	});

	it('is stable: merging a record with itself changes nothing that matters', () => {
		const one = mergeWorkRecords(
			text(rec('v1', { contributors: [{ name: 'Ada', login: 'ada' }] })),
			text(rec('v1', { contributors: [{ name: 'Ada', login: 'ada' }] })),
		);
		expect(mergeWorkRecords(one as string, one as string)).toBe(one);
	});
});

describe('reading work.json', () => {
	const good = { prototypeId: 'p', name: 'v1', branch: 'prototype/p/v1', commit: null, createdAt: '2026-10-01T00:00:00Z', note: '' };

	it('reads a list of records, each with a name and a branch, and nothing else', () => {
		expect(parseWork(JSON.stringify([good]))).toEqual([good]);
		for (const bad of ['{nope', '{}', '[1]', JSON.stringify([{ ...good, name: 3 }]), JSON.stringify([{ ...good, branch: undefined }])])
			expect(parseWork(bad), bad).toBeNull();
	});

	it('reads a record only by a name it can have: a version, or codebase', () => {
		expect(parseWork(JSON.stringify([good, { ...good, name: 'codebase', branch: 'feature/p' }]))?.map((r) => r.name)).toEqual(['v1', 'codebase']);
		// The old shapes (a version and its iteration, a name from before versions) are not read, nor is anything else: the
		// file is refused whole, rather than read with a record quietly missing.
		for (const name of ['v1-i1', 'i1', 'spike', '../v1', ''])
			expect(parseWork(JSON.stringify([good, { ...good, name, branch: `prototype/p/${name}` }])), name).toBeNull();
		expect(mergeWorkRecords(JSON.stringify([good]), JSON.stringify([{ ...good, name: 'v1-i2' }]))).toBeNull();
	});

	it('reads which version a version was started from, and only a version', () => {
		expect(parseWork(JSON.stringify([{ ...good, name: 'v2', from: 'v1' }]))?.[0]?.from).toBe('v1');
		for (const from of ['v1-i1', 'codebase', 7, '../v1'])
			expect(parseWork(JSON.stringify([{ ...good, name: 'v2', from }]))?.[0], String(from)).not.toHaveProperty('from');
	});

	it('leaves out a field that is not what it should be, rather than trusting it', () => {
		const [r] = parseWork(
			JSON.stringify([
				{
					...good,
					route: 'https://elsewhere',
					cover: 'nothex',
					pullRequest: 'javascript:x',
					repository: 'not a repo',
					contributors: 'Noah',
					previewUrl: 7,
				},
			]),
		)!;
		for (const field of ['route', 'cover', 'pullRequest', 'repository', 'previewUrl', 'contributors']) expect(r, field).not.toHaveProperty(field);
	});

	it('keeps what it does not know, so writing a list back never loses what a newer app wrote', () => {
		const [r] = parseWork(JSON.stringify([{ ...good, somethingNew: { a: 1 } }]))!;
		expect(JSON.parse(serializeWork([r!]))[0].somethingNew).toEqual({ a: 1 });
	});

	it('is written one way: two-space JSON, ending in a newline', () => {
		expect(serializeWork([good])).toBe(`${JSON.stringify([good], null, 2)}\n`);
	});

	it('is shown with its thread when there is one, and none when there is not', () => {
		const shown = toPrototypeWork({ ...good, previewUrl: 'https://p', route: '/users' }, { number: 9, openComments: 2 });
		expect(shown).toMatchObject({
			name: 'v1',
			branch: 'prototype/p/v1',
			issueNumber: 9,
			openComments: 2,
			previewUrl: 'https://p',
			route: '/users',
			contributors: [],
		});
		expect(toPrototypeWork(good)).toMatchObject({
			issueNumber: null,
			openComments: 0,
			previewUrl: null,
			route: null,
			createdAt: '2026-10-01T00:00:00Z',
		});
	});
});

describe('the product a prototype was made on', () => {
	const read = (basedOn: unknown) =>
		parseWork(JSON.stringify([{ prototypeId: 'demo', name: 'v1', branch: 'prototype/demo/v1', createdAt: '2026-10-14T10:00:00Z', basedOn }]))?.[0]
			?.basedOn;

	it('is kept as a repository on its host, beside the clone’s own name', () => {
		expect(read({ repository: 'coke', branch: 'develop', commit: null, product: 'flocksafety/flock-coke' })).toEqual({
			repository: 'coke',
			branch: 'develop',
			commit: null,
			product: 'flocksafety/flock-coke',
		});
	});

	it('is left out when it is not one, and a record without it reads as before', () => {
		for (const product of ['../flock-coke', 'flock-coke', 'a/b/c', 42])
			expect(read({ repository: 'coke', branch: 'develop', commit: null, product }), String(product)).toEqual({
				repository: 'coke',
				branch: 'develop',
				commit: null,
			});
		expect(read({ repository: 'coke', branch: 'develop', commit: null })).toEqual({ repository: 'coke', branch: 'develop', commit: null });
	});
});

describe('the commit a handoff found codebase work ready at', () => {
	const read = (readyAt: unknown) =>
		parseWork(JSON.stringify([{ prototypeId: 'demo', name: 'codebase', branch: 'feature/demo', createdAt: '2026-10-14T10:00:00Z', readyAt }]))?.[0];

	it('is kept when it is a commit, and given to the list as the record says it', () => {
		expect(read('a1b2c3d')?.readyAt).toBe('a1b2c3d');
		expect(toPrototypeWork(read('a1b2c3d')!).readyAt).toBe('a1b2c3d');
	});

	it('is left out when it is not one', () => {
		for (const readyAt of ['main', 'a1b2', 'A1B2C3D', 42, null]) expect(read(readyAt)?.readyAt, String(readyAt)).toBeUndefined();
		expect(toPrototypeWork(read('nope')!).readyAt).toBeNull();
	});
});
