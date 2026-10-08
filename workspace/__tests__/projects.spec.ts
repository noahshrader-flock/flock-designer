import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Project, ProjectIteration } from '../src/shared/contract';
import {
	PROJECT_ID,
	asDate,
	asRoute,
	isPrototypeName,
	isRecordName,
	iterationLabel,
	mergeProjects,
	newestProjectFirst,
	nextIterationName,
	nextPrototypeName,
	byVersion,
	parsePrototypeName,
	prototypeName,
	slugify,
	startedAt,
	unionLocal,
	workOf,
} from '../src/shared/projects';
import { readFolderProjects } from '../src/main/services/localProjects';

const it1 = (over: Partial<ProjectIteration> = {}): ProjectIteration => ({
	name: 'i1', branch: 'fd/alpha/i1', issueNumber: null, previewUrl: null, commit: null, contributors: [], createdAt: null, ...over,
});
const project = (id: string, over: Partial<Project> = {}): Project => ({
	id, title: id, records: [], iterations: [it1({ branch: `fd/${id}/i1` })], people: [], openComments: 0, ...over,
});

describe('mergeProjects', () => {
	it('shows work built here that GitHub has never heard of, and says so', () => {
		const merged = mergeProjects([project('shared')], [project('mine')]);
		expect(merged.map((p) => [p.id, p.localOnly])).toEqual([['mine', true], ['shared', false]]);
		expect(merged[0]?.iterations[0]?.localOnly).toBe(true);
	});

	it('does not duplicate a project both sides know, and lets GitHub lead', () => {
		const merged = mergeProjects(
			[project('alpha', { title: 'Alpha, as shared', openComments: 3 })],
			[project('alpha', { title: 'Alpha, locally' })],
		);
		expect(merged).toHaveLength(1);
		expect(merged[0]).toMatchObject({ title: 'Alpha, as shared', openComments: 3, localOnly: false });
	});

	it('adds an iteration made here to a project that is already shared', () => {
		const remote = project('alpha', { iterations: [it1({ branch: 'fd/alpha/i1' })] });
		const local = project('alpha', { iterations: [it1({ name: 'i2', branch: 'fd/alpha/i2' }), it1({ branch: 'fd/alpha/i1' })] });
		const [m] = mergeProjects([remote], [local]);
		expect(m?.iterations.map((i) => [i.name, i.localOnly])).toEqual([['i2', true], ['i1', false]]);
	});

	it('uses the local brief to name a project GitHub only knows by its id', () => {
		const [m] = mergeProjects([project('alpha')], [project('alpha', { title: 'Alpha, with a real name' })]);
		expect(m?.title).toBe('Alpha, with a real name');
	});

	it('still lists what is local when nothing could be fetched from GitHub', () => {
		expect(mergeProjects([], [project('mine')]).map((p) => p.id)).toEqual(['mine']);
	});

	it('combines the people on both sides', () => {
		const [m] = mergeProjects(
			[project('alpha', { people: [{ name: 'Ada', login: 'ada' }] })],
			[project('alpha', { people: [{ name: 'Grace', login: null }] })],
		);
		expect(m?.people.map((p) => p.name).sort()).toEqual(['Ada', 'Grace']);
	});
});

const started = (id: string, ...dates: Array<string | null>): Project =>
	project(id, { iterations: dates.map((d, i) => it1({ name: `i${i + 1}`, branch: `fd/${id}/i${i + 1}`, createdAt: d })) });

describe('the order of the project list', () => {
	it('puts the most recently started project first', () => {
		const merged = mergeProjects([started('old', '2026-09-01T10:00:00Z'), started('new', '2026-10-05T10:00:00Z'), started('mid', '2026-09-20T10:00:00Z')], []);
		expect(merged.map((p) => p.id)).toEqual(['new', 'mid', 'old']);
	});

	it('dates a project by its first iteration, so adding iterations to an old project does not make it new', () => {
		const merged = mergeProjects([started('long-running', '2026-09-01T00:00:00Z', '2026-10-05T00:00:00Z', '2026-10-06T00:00:00Z'), started('fresh', '2026-10-01T00:00:00Z')], []);
		expect(merged.map((p) => p.id)).toEqual(['fresh', 'long-running']);
		expect(startedAt(merged[1] as Project)).toBe('2026-09-01T00:00:00Z');
	});

	it('compares moments, not text, so different offsets and formats order correctly', () => {
		const merged = mergeProjects([started('a', '2026-10-05T23:00:00-04:00'), started('b', '2026-10-06T02:00:00Z'), started('c', '2026-10-06T04:00:00Z')], []);
		// a is 03:00Z on the 6th, b is 02:00Z, c is 04:00Z
		expect(merged.map((p) => p.id)).toEqual(['c', 'a', 'b']);
	});

	it('puts a project whose start is unknown last, and breaks every tie by title so the list never shuffles', () => {
		const list = [started('zeta', null), started('beta', '2026-10-01T00:00:00Z'), started('alpha', '2026-10-01T00:00:00Z'), started('omega', null)];
		expect(mergeProjects(list, []).map((p) => p.id)).toEqual(['alpha', 'beta', 'omega', 'zeta']);
		expect(mergeProjects([...list].reverse(), []).map((p) => p.id)).toEqual(['alpha', 'beta', 'omega', 'zeta']);
	});

	it('orders GitHub and local-only projects together', () => {
		const merged = mergeProjects([started('shared', '2026-09-01T00:00:00Z')], [started('mine', '2026-10-05T00:00:00Z')]);
		expect(merged.map((p) => p.id)).toEqual(['mine', 'shared']);
	});

	it('takes a date from the local side when GitHub has none, rather than losing the project\'s place', () => {
		const merged = mergeProjects(
			[started('alpha', null), started('beta', '2026-09-15T00:00:00Z')],
			[started('alpha', '2026-10-05T00:00:00Z')],
		);
		expect(merged.map((p) => p.id)).toEqual(['alpha', 'beta']);
	});

	it('takes a date from a branch when the record has none', () => {
		const records = [started('alpha', null)];
		const branches = [started('alpha', '2026-10-05T00:00:00Z')];
		expect(startedAt(unionLocal(records, branches)[0] as Project)).toBe('2026-10-05T00:00:00Z');
	});

	it('does not let an unreadable date count as a date', () => {
		expect(['2026-10-05T10:00:00Z', 'yesterday', '', null, 5, undefined].map(asDate)).toEqual(['2026-10-05T10:00:00Z', null, null, null, null, null]);
		expect(newestProjectFirst(started('a', null), started('b', null))).toBeLessThan(0);
	});
});

describe('reading projects from their folders', () => {
	let root: string;
	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'fdw-local-'));
	});
	afterEach(() => rmSync(root, { recursive: true, force: true }));

	const write = (id: string, files: Record<string, string>) => {
		mkdirSync(join(root, id), { recursive: true });
		for (const [name, body] of Object.entries(files)) writeFileSync(join(root, id, name), body);
	};
	// The rule the app applies to what it shows: a folder with nothing built yet is a notes folder.
	const inProgress = (dir: string) => readFolderProjects(dir).filter((p) => p.iterations.length > 0);

	it('finds a project from its folder, with its title and iterations, with nothing registered', () => {
		write('alpha', {
			'brief.md': '# Alpha prototype\n\nWhy.',
			'iterations.json': JSON.stringify([{ name: 'i1', branch: 'fd/alpha/i1', commit: 'abc', contributors: [{ name: 'Noah', login: 'noah' }] }]),
		});
		const [p] = inProgress(root);
		expect(p).toMatchObject({ id: 'alpha', title: 'Alpha prototype', people: [{ name: 'Noah', login: 'noah' }] });
		expect(p?.iterations[0]).toMatchObject({ name: 'i1', branch: 'fd/alpha/i1', commit: 'abc' });
	});

	it('reads when each iteration was started, and ignores a date that is not one', () => {
		write('dated', { 'iterations.json': JSON.stringify([{ name: 'i1', branch: 'fd/dated/i1', createdAt: '2026-09-28T17:13:52-04:00' }, { name: 'i2', branch: 'fd/dated/i2', createdAt: 'not a date' }]) });
		const [p] = inProgress(root);
		expect(p?.iterations.find((i) => i.name === 'i1')?.createdAt).toBe('2026-09-28T17:13:52-04:00');
		expect(p?.iterations.find((i) => i.name === 'i2')?.createdAt).toBeNull();
	});

	it('names a project by its id when it has no brief yet', () => {
		write('beta', { 'iterations.json': JSON.stringify([{ name: 'i1', branch: 'fd/beta/i1' }]) });
		expect(inProgress(root)[0]?.title).toBe('beta');
	});

	it('skips templates, notes folders with no iterations, and unreadable records, without failing', () => {
		write('_template', { 'iterations.json': JSON.stringify([{ name: 'i1', branch: 'x' }]) });
		write('notes', { 'brief.md': '# Just notes' });
		write('broken', { 'iterations.json': '{not json' });
		write('good', { 'iterations.json': JSON.stringify([{ name: 'i1', branch: 'fd/good/i1' }]) });
		expect(inProgress(root).map((p) => p.id)).toEqual(['good']);
	});

	it('returns nothing, not an error, when the design repository is not there', () => {
		expect(inProgress(join(root, 'nope'))).toEqual([]);
		expect(readFolderProjects(join(root, 'nope'))).toEqual([]);
	});

	it('knows a project an agent has only just started: a folder with a brief and nothing built', () => {
		write('new-view', { 'brief.md': '# A new view\n\nWhy.' });
		write('_template', { 'brief.md': '# t' });
		expect(readFolderProjects(root).map((p) => p.id)).toEqual(['new-view']);
		expect(readFolderProjects(root)[0]).toMatchObject({ title: 'A new view', records: ['brief.md'], iterations: [] });
		expect(inProgress(root)).toEqual([]); // not work in progress until something is recorded
	});
});

describe('asRoute', () => {
	it('takes a path to the work, with or without a leading slash, and keeps the query', () => {
		expect(asRoute('/roles/compare')).toBe('/roles/compare');
		expect(asRoute('roles/compare')).toBe('/roles/compare');
		expect(asRoute('/roles/compare?state=error')).toBe('/roles/compare?state=error');
		expect(asRoute('  /roles/compare  ')).toBe('/roles/compare');
	});

	it('is null when the record does not say, so the preview opens where it always did', () => {
		expect(asRoute(undefined)).toBeNull();
		expect(asRoute(null)).toBeNull();
		expect(asRoute('')).toBeNull();
		expect(asRoute('   ')).toBeNull();
		expect(asRoute(42)).toBeNull();
		expect(asRoute({ path: '/x' })).toBeNull();
	});

	it('refuses anything that could leave the preview, because this comes from a file an agent wrote', () => {
		// A scheme would take the preview somewhere else entirely.
		expect(asRoute('javascript:alert(1)')).toBeNull();
		expect(asRoute('https://evil.test/steal')).toBeNull();
		expect(asRoute('HTTP://evil.test')).toBeNull();
		expect(asRoute('data:text/html,<script>')).toBeNull();
		// A protocol-relative address is a host, not a path.
		expect(asRoute('//evil.test/steal')).toBeNull();
		// Some parsers read a backslash as a slash, so it never reaches one.
		expect(asRoute('/\\evil.test')).toBeNull();
		expect(asRoute('\\\\evil.test')).toBeNull();
		// Control characters and whitespace can split a header or hide the rest of a line.
		expect(asRoute('/roles\nHost: evil.test')).toBeNull();
		expect(asRoute('/roles compare')).toBeNull();
		// A route that climbs is a mistake in the record.
		expect(asRoute('/../../etc/passwd')).toBeNull();
		expect(asRoute('..')).toBeNull();
		// And nothing absurdly long.
		expect(asRoute(`/${'a'.repeat(400)}`)).toBeNull();
	});

	it('refuses a route pattern, which is what a router matches and not an address', () => {
		// The likeliest mistake: a product's route table says `/organization/:id/roles/compare`, and
		// that is copied into the record. As an address the `:id` is literal and matches nothing, so
		// the preview would open an error page looking like the work itself had failed.
		expect(asRoute('/organization/:id/roles/compare')).toBeNull();
		expect(asRoute('/org/{id}/roles')).toBeNull();
		expect(asRoute('/org/*/roles')).toBeNull();
		// A colon that is not a parameter is fine: it appears in real paths.
		expect(asRoute('/notes/10:30')).toBe('/notes/10:30');
	});
});

describe('slugify', () => {
	it('makes an id the main process will accept, however long the name', () => {
		// This used to truncate mid-word and leave a trailing hyphen, which the
		// dialog showed as valid and createIteration then rejected.
		const long = 'Users list inactivity signal for organisation administrator review';
		expect(PROJECT_ID.test(slugify(long))).toBe(true);
		expect(PROJECT_ID.test(slugify(`${'a'.repeat(59)} b`))).toBe(true);
	});

	it('turns an ordinary name into the expected id', () => {
		expect(slugify('Users list — inactivity signal')).toBe('users-list-inactivity-signal');
	});

	it('gives an empty id for a name with nothing usable in it, so Create stays disabled', () => {
		expect(slugify('   ---   ')).toBe('');
	});
});

describe('isRecordName', () => {
	it('accepts the names a project folder holds', () => {
		for (const n of ['brief.md', 'context-receipt.md', 'iterations.json', 'role-comparison']) expect(isRecordName(n)).toBe(true);
	});

	it('refuses anything that is a path, a hidden file or not a name, since it is joined onto a folder and an address', () => {
		for (const n of ['../brief.md', 'a/b.md', '..', '.env', '', 'a..b', 'brief.md\n', 7, null]) expect(isRecordName(n)).toBe(false);
	});
});

describe('workOf', () => {
	const iterations = [
		it1({ name: 'codebase', branch: 'feature/alpha', createdAt: '2026-10-03T00:00:00Z' }),
		it1({ name: 'i1', branch: 'fd/alpha/i1', createdAt: '2026-10-01T00:00:00Z' }),
		it1({ name: 'i2', branch: 'prototype/alpha/i2', createdAt: '2026-10-02T00:00:00Z' }),
		it1({ name: 'i3', branch: 'prototype/alpha/i3', createdAt: null }),
	];

	it('counts prototype pages and prototype branches as prototypes, newest first, undated last', () => {
		expect(workOf(iterations, 'prototype').map((i) => i.name)).toEqual(['i2', 'i1', 'i3']);
	});

	it('keeps codebase work on its own', () => {
		expect(workOf(iterations, 'codebase').map((i) => i.name)).toEqual(['codebase']);
	});

	it('does not take a prototype page named codebase for codebase work', () => {
		expect(workOf([it1({ name: 'codebase', branch: 'prototype/alpha/codebase' })], 'codebase')).toEqual([]);
	});
});

describe('versions and iterations in a prototype\'s name', () => {
	it.each([
		['v1-i1', { version: 1, iteration: 1, legacy: false }],
		['v2-i3', { version: 2, iteration: 3, legacy: false }],
		['v12-i40', { version: 12, iteration: 40, legacy: false }],
		// Names from before versions are version 1: the same key, files and thread as always.
		['i1', { version: 1, iteration: 1, legacy: true }],
		['i7', { version: 1, iteration: 7, legacy: true }],
	])('reads %s', (name, parsed) => {
		expect(parsePrototypeName(name)).toEqual(parsed);
		expect(isPrototypeName(name)).toBe(true);
	});

	it.each(['codebase', 'v1', 'v1-', 'v1-i', 'v0-i1', 'v1-i0', 'i0', 'V1-I1', 'v1_i1', 'q1', '../i1', 'v1-i1x', ''])('refuses %s', (name) => {
		expect(parsePrototypeName(name)).toBeNull();
		expect(isPrototypeName(name)).toBe(false);
	});

	it('writes names in the new form only', () => {
		expect(prototypeName(1, 1)).toBe('v1-i1');
		expect(prototypeName(3, 2)).toBe('v3-i2');
	});

	it('starts a new idea as the next version, counting older names as version 1', () => {
		expect(nextPrototypeName([])).toBe('v1-i1');
		expect(nextPrototypeName(['codebase'])).toBe('v1-i1');
		expect(nextPrototypeName(['i1'])).toBe('v2-i1');
		expect(nextPrototypeName(['i1', 'i2', 'codebase'])).toBe('v2-i1');
		expect(nextPrototypeName(['v1-i1', 'v1-i2', 'v3-i1'])).toBe('v4-i1');
	});

	it('refines a version as its next iteration, never reusing a number', () => {
		expect(nextIterationName(['v1-i1'], 1)).toBe('v1-i2');
		expect(nextIterationName(['v1-i1', 'v1-i3', 'v2-i1'], 1)).toBe('v1-i4');
		expect(nextIterationName(['v1-i1', 'v2-i1'], 2)).toBe('v2-i2');
		expect(nextIterationName(['i1', 'i2'], 1)).toBe('v1-i3');
		expect(nextIterationName([], 1)).toBe('v1-i1');
	});

	it('labels them for people as V and I', () => {
		const p = (name: string, branch = `prototype/demo/${name}`) => ({ name, branch });
		expect(iterationLabel(p('v2-i3'))).toBe('V2 · I3');
		expect(iterationLabel(p('i1'))).toBe('V1 · I1');
		expect(iterationLabel(p('i2', 'fd/demo/i2'))).toBe('V1 · I2');
		// Codebase work keeps the label it has today.
		expect(iterationLabel({ name: 'codebase', branch: 'feature/demo' })).toBe('I1');
	});
});

describe('byVersion', () => {
	const it1 = (name: string, createdAt: string): ProjectIteration => ({
		name, branch: `prototype/demo/${name}`, issueNumber: null, previewUrl: null, commit: null, contributors: [], createdAt, route: null,
	});

	it('groups a project\'s prototypes by version, keeping the order it was given', () => {
		const newestFirst = [it1('v2-i1', '2026-10-05'), it1('v1-i2', '2026-10-04'), it1('i1', '2026-10-01')];
		expect(byVersion(newestFirst).map((g) => [g.version, g.iterations.map((i) => i.name)])).toEqual([
			[2, ['v2-i1']],
			[1, ['v1-i2', 'i1']],
		]);
	});

	it('leaves out anything that is not a prototype name', () => {
		expect(byVersion([it1('codebase', '2026-10-05')])).toEqual([]);
	});
});
