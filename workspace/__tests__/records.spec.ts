import { describe, expect, it } from 'vitest';
import { mergeIterationRecords } from '../src/shared/records';

const rec = (name: string, extra: Record<string, unknown> = {}) => ({ projectId: 'p', name, branch: `fd/p/${name}`, commit: null, createdAt: '2026-10-01T00:00:00Z', ...extra });
const text = (...r: unknown[]) => JSON.stringify(r, null, 2);
const names = (json: string | null) => (JSON.parse(json as string) as Array<{ name: string }>).map((r) => r.name);
const find = (json: string | null, name: string) => (JSON.parse(json as string) as Array<Record<string, unknown>>).find((r) => r.name === name) as Record<string, unknown>;

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

	it('keeps the earliest start date, so merging never makes work look newer', () => {
		const merged = mergeIterationRecords(text(rec('i1', { createdAt: '2026-10-05T00:00:00Z' })), text(rec('i1', { createdAt: '2026-09-28T00:00:00Z' })));
		expect(find(merged, 'i1').createdAt).toBe('2026-09-28T00:00:00Z');
	});

	it('combines contributors from both sides without repeating anyone', () => {
		const merged = mergeIterationRecords(
			text(rec('i1', { contributors: [{ name: 'Ada', login: 'ada' }] })),
			text(rec('i1', { contributors: [{ name: 'Ada', login: 'ada' }, { name: 'Grace', login: null }] })),
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
		const one = mergeIterationRecords(text(rec('i1', { contributors: [{ name: 'Ada', login: 'ada' }] })), text(rec('i1', { contributors: [{ name: 'Ada', login: 'ada' }] })));
		expect(mergeIterationRecords(one as string, one as string)).toBe(one);
	});
});
