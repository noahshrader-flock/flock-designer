import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Project, ProjectIteration } from '../src/shared/contract';
import { mergeProjects } from '../src/shared/projects';
import { readLocalProjects } from '../src/main/services/localProjects';

const it1 = (over: Partial<ProjectIteration> = {}): ProjectIteration => ({
	name: 'i1', branch: 'fd/alpha/i1', issueNumber: null, previewUrl: null, commit: null, contributors: [], ...over,
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

describe('readLocalProjects', () => {
	let root: string;
	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'fdw-local-'));
	});
	afterEach(() => rmSync(root, { recursive: true, force: true }));

	const write = (id: string, files: Record<string, string>) => {
		mkdirSync(join(root, id), { recursive: true });
		for (const [name, body] of Object.entries(files)) writeFileSync(join(root, id, name), body);
	};

	it('finds a project from its folder, with its title and iterations, with nothing registered', () => {
		write('alpha', {
			'brief.md': '# Alpha prototype\n\nWhy.',
			'iterations.json': JSON.stringify([{ name: 'i1', branch: 'fd/alpha/i1', commit: 'abc', contributors: [{ name: 'Noah', login: 'noah' }] }]),
		});
		const [p] = readLocalProjects(root);
		expect(p).toMatchObject({ id: 'alpha', title: 'Alpha prototype', people: [{ name: 'Noah', login: 'noah' }] });
		expect(p?.iterations[0]).toMatchObject({ name: 'i1', branch: 'fd/alpha/i1', commit: 'abc' });
	});

	it('names a project by its id when it has no brief yet', () => {
		write('beta', { 'iterations.json': JSON.stringify([{ name: 'i1', branch: 'fd/beta/i1' }]) });
		expect(readLocalProjects(root)[0]?.title).toBe('beta');
	});

	it('skips templates, notes folders with no iterations, and unreadable records, without failing', () => {
		write('_template', { 'iterations.json': JSON.stringify([{ name: 'i1', branch: 'x' }]) });
		write('notes', { 'brief.md': '# Just notes' });
		write('broken', { 'iterations.json': '{not json' });
		write('good', { 'iterations.json': JSON.stringify([{ name: 'i1', branch: 'fd/good/i1' }]) });
		expect(readLocalProjects(root).map((p) => p.id)).toEqual(['good']);
	});

	it('returns nothing, not an error, when the design repository is not there', () => {
		expect(readLocalProjects(join(root, 'nope'))).toEqual([]);
	});
});
