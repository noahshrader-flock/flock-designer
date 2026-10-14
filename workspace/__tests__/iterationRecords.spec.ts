import { describe, expect, it } from 'vitest';
import { mergeIterationRecords, parseIterations, serializeIterations, toProjectIteration } from '../src/shared/iterationRecords';

const rec = (name: string, extra: Record<string, unknown> = {}) => ({
	projectId: 'p',
	name,
	branch: `fd/p/${name}`,
	commit: null,
	createdAt: '2026-10-01T00:00:00Z',
	...extra,
});
const text = (...r: unknown[]) => JSON.stringify(r, null, 2);
const names = (json: string | null) => (JSON.parse(json as string) as Array<{ name: string }>).map((r) => r.name);
const find = (json: string | null, name: string) =>
	(JSON.parse(json as string) as Array<Record<string, unknown>>).find((r) => r.name === name) as Record<string, unknown>;

describe('mergeIterationRecords', () => {
	it('keeps every iteration either side knows, in order', () => {
		expect(names(mergeIterationRecords(text(rec('i1'), rec('i3')), text(rec('i1'), rec('i2'))))).toEqual(['i1', 'i2', 'i3']);
	});

	it('sorts i10 after i9, not after i1', () => {
		expect(names(mergeIterationRecords(text(rec('i10')), text(rec('i9'), rec('i2'))))).toEqual(['i2', 'i9', 'i10']);
	});

	it("prefers this machine's value where both have one", () => {
		expect(find(mergeIterationRecords(text(rec('i1', { commit: 'mine' })), text(rec('i1', { commit: 'theirs' }))), 'i1').commit).toBe('mine');
	});

	it("does not let this machine's missing value blank one the other side has", () => {
		const merged = mergeIterationRecords(text(rec('i1', { commit: null })), text(rec('i1', { commit: 'abc', previewUrl: 'https://x.test' })));
		expect(find(merged, 'i1')).toMatchObject({ commit: 'abc', previewUrl: 'https://x.test' });
	});

	it('keeps a prototype’s picture across machines: this machine’s when it has one, never blanked by one that has none', () => {
		const newer = mergeIterationRecords(text(rec('i1', { cover: 'bbbbbbbbbbbb' })), text(rec('i1', { cover: 'aaaaaaaaaaaa' })));
		expect(find(newer, 'i1').cover).toBe('bbbbbbbbbbbb');
		const kept = mergeIterationRecords(text(rec('i1')), text(rec('i1', { cover: 'aaaaaaaaaaaa' })));
		expect(find(kept, 'i1').cover).toBe('aaaaaaaaaaaa');
	});

	it('keeps the earliest start date, so merging never makes work look newer', () => {
		const merged = mergeIterationRecords(
			text(rec('i1', { createdAt: '2026-10-05T00:00:00Z' })),
			text(rec('i1', { createdAt: '2026-09-28T00:00:00Z' })),
		);
		expect(find(merged, 'i1').createdAt).toBe('2026-09-28T00:00:00Z');
	});

	it('combines contributors from both sides without repeating anyone', () => {
		const merged = mergeIterationRecords(
			text(rec('i1', { contributors: [{ name: 'Ada', login: 'ada' }] })),
			text(
				rec('i1', {
					contributors: [
						{ name: 'Ada', login: 'ada' },
						{ name: 'Grace', login: null },
					],
				}),
			),
		);
		expect((find(merged, 'i1').contributors as Array<{ name: string }>).map((p) => p.name).sort()).toEqual(['Ada', 'Grace']);
	});

	it('keeps fields it does not know about, so a newer app version does not lose data to an older one', () => {
		expect(find(mergeIterationRecords(text(rec('i1')), text(rec('i1', { somethingNew: 7 }))), 'i1').somethingNew).toBe(7);
	});

	it('ends with a newline, as the file always has, so a merge does not make a spurious diff', () => {
		expect(mergeIterationRecords(text(rec('i1')), text(rec('i1')))?.endsWith('\n')).toBe(true);
	});

	it.each([
		['not json', 'nope', text(rec('i1'))],
		['not a list', '{"a":1}', text(rec('i1'))],
		['entries without a name', '[{"branch":"x"}]', text(rec('i1'))],
		['the other side broken', text(rec('i1')), '[{'],
	])('gives up, rather than guess, when %s', (_label, a, b) => {
		expect(mergeIterationRecords(a, b)).toBeNull();
	});

	it('is stable: merging a record with itself changes nothing that matters', () => {
		const one = mergeIterationRecords(
			text(rec('i1', { contributors: [{ name: 'Ada', login: 'ada' }] })),
			text(rec('i1', { contributors: [{ name: 'Ada', login: 'ada' }] })),
		);
		expect(mergeIterationRecords(one as string, one as string)).toBe(one);
	});
});

describe('reading iterations.json', () => {
	const good = { projectId: 'p', name: 'i1', branch: 'fd/p/i1', commit: null, createdAt: '2026-10-01T00:00:00Z', note: '' };

	it('reads a list of records, each with a name and a branch, and nothing else', () => {
		expect(parseIterations(JSON.stringify([good]))).toEqual([good]);
		for (const bad of ['{nope', '{}', '[1]', JSON.stringify([{ ...good, name: 3 }]), JSON.stringify([{ ...good, branch: undefined }])])
			expect(parseIterations(bad), bad).toBeNull();
	});

	it('leaves out a field that is not what it should be, rather than trusting it', () => {
		const [r] = parseIterations(
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
		const [r] = parseIterations(JSON.stringify([{ ...good, somethingNew: { a: 1 } }]))!;
		expect(JSON.parse(serializeIterations([r!]))[0].somethingNew).toEqual({ a: 1 });
	});

	it('is written one way: two-space JSON, ending in a newline', () => {
		expect(serializeIterations([good])).toBe(`${JSON.stringify([good], null, 2)}\n`);
	});

	it('is shown with its thread when there is one, and none when there is not', () => {
		const shown = toProjectIteration({ ...good, previewUrl: 'https://p', route: '/users' }, { number: 9, openComments: 2 });
		expect(shown).toMatchObject({
			name: 'i1',
			branch: 'fd/p/i1',
			issueNumber: 9,
			openComments: 2,
			previewUrl: 'https://p',
			route: '/users',
			contributors: [],
		});
		expect(toProjectIteration(good)).toMatchObject({
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
		parseIterations(
			JSON.stringify([{ projectId: 'demo', name: 'v1-i1', branch: 'prototype/demo/v1-i1', createdAt: '2026-10-14T10:00:00Z', basedOn }]),
		)?.[0]?.basedOn;

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
