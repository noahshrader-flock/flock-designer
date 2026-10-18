import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Project, ProjectWork } from '../src/shared/contract';
import { recordLabel } from '../src/shared/brief';
import {
	lastUpdated,
	matchesProject,
	mergeProjects,
	newestProjectFirst,
	sortProjects,
	startedAt,
	unionLocal,
	coverToShow,
	projectOpening,
	withCovers,
} from '../src/shared/projectList';
import { isPrototypeName, commentsFromOthers, nextVersionName, parseVersion, prototypeName } from '../src/shared/prototypeNames';
import { PROJECT_ID, asDate, asRoute, slugify, asCover } from '../src/shared/validate';
import { codeLink, workLabel, workOf } from '../src/shared/work';
import { readFolderProjects } from '../src/core/services/localProjects';
import { aProject, projectWork } from './fixtures';

const it1 = (over: Partial<ProjectWork> = {}): ProjectWork => projectWork({ name: 'v1', branch: 'prototype/alpha/v1', ...over });
const project = (id: string, over: Partial<Project> = {}): Project => aProject({ id, work: [it1({ branch: `prototype/${id}/v1` })], ...over });

describe('mergeProjects', () => {
	it('shows work built here that GitHub has never heard of, and says so', () => {
		const merged = mergeProjects([project('shared')], [project('mine')]);
		expect(merged.map((p) => [p.id, p.localOnly])).toEqual([
			['mine', true],
			['shared', false],
		]);
		expect(merged[0]?.work[0]?.localOnly).toBe(true);
	});

	it('does not duplicate a project both sides know, and lets GitHub lead', () => {
		const merged = mergeProjects(
			[project('alpha', { title: 'Alpha, as shared', work: [it1({ openComments: 3 })] })],
			[project('alpha', { title: 'Alpha, locally' })],
		);
		expect(merged).toHaveLength(1);
		expect(merged[0]).toMatchObject({ title: 'Alpha, as shared', localOnly: false });
		expect(merged[0]?.work[0]?.openComments).toBe(3);
	});

	it('shows the picture this machine has just made before GitHub has it, and GitHub’s when this machine has none', () => {
		const made = mergeProjects([project('alpha', { work: [it1({ cover: null })] })], [project('alpha', { work: [it1({ cover: 'bbbbbbbbbbbb' })] })]);
		expect(made[0]?.work[0]?.cover).toBe('bbbbbbbbbbbb');
		const shared = mergeProjects(
			[project('alpha', { work: [it1({ cover: 'aaaaaaaaaaaa' })] })],
			[project('alpha', { work: [it1({ cover: null })] })],
		);
		expect(shared[0]?.work[0]?.cover).toBe('aaaaaaaaaaaa');
	});

	it('adds a version made here to a project that is already shared', () => {
		const remote = project('alpha', { work: [it1({ branch: 'prototype/alpha/v1' })] });
		const local = project('alpha', { work: [it1({ name: 'v2', branch: 'prototype/alpha/v2' }), it1({ branch: 'prototype/alpha/v1' })] });
		const [m] = mergeProjects([remote], [local]);
		expect(m?.work.map((i) => [i.name, i.localOnly])).toEqual([
			['v2', true],
			['v1', false],
		]);
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
	project(id, { work: dates.map((d, i) => it1({ name: `v${i + 1}`, branch: `prototype/${id}/v${i + 1}`, createdAt: d })) });

describe('the order of the project list', () => {
	it('puts the most recently started project first', () => {
		const merged = mergeProjects(
			[started('old', '2026-09-01T10:00:00Z'), started('new', '2026-10-05T10:00:00Z'), started('mid', '2026-09-20T10:00:00Z')],
			[],
		);
		expect(merged.map((p) => p.id)).toEqual(['new', 'mid', 'old']);
	});

	it('dates a project by its first version, so adding work to an old project does not make it new', () => {
		const merged = mergeProjects(
			[started('long-running', '2026-09-01T00:00:00Z', '2026-10-05T00:00:00Z', '2026-10-06T00:00:00Z'), started('fresh', '2026-10-01T00:00:00Z')],
			[],
		);
		expect(merged.map((p) => p.id)).toEqual(['fresh', 'long-running']);
		expect(startedAt(merged[1] as Project)).toBe('2026-09-01T00:00:00Z');
	});

	it('compares moments, not text, so different offsets and formats order correctly', () => {
		const merged = mergeProjects(
			[started('a', '2026-10-05T23:00:00-04:00'), started('b', '2026-10-06T02:00:00Z'), started('c', '2026-10-06T04:00:00Z')],
			[],
		);
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

	it("takes a date from the local side when GitHub has none, rather than losing the project's place", () => {
		const merged = mergeProjects([started('alpha', null), started('beta', '2026-09-15T00:00:00Z')], [started('alpha', '2026-10-05T00:00:00Z')]);
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
	const inProgress = (dir: string) => readFolderProjects(dir).filter((p) => p.work.length > 0);

	it('finds a project from its folder, with its title and work, with nothing registered', () => {
		write('alpha', {
			'brief.md': '# Alpha prototype\n\nWhy.',
			'work.json': JSON.stringify([{ name: 'v1', branch: 'prototype/alpha/v1', commit: 'abc', contributors: [{ name: 'Noah', login: 'noah' }] }]),
		});
		const [p] = inProgress(root);
		expect(p).toMatchObject({ id: 'alpha', title: 'Alpha prototype', people: [{ name: 'Noah', login: 'noah' }] });
		expect(p?.work[0]).toMatchObject({ name: 'v1', branch: 'prototype/alpha/v1', commit: 'abc' });
	});

	it('reads when each version was started, and ignores a date that is not one', () => {
		write('dated', {
			'work.json': JSON.stringify([
				{ name: 'v1', branch: 'prototype/dated/v1', createdAt: '2026-09-28T17:13:52-04:00' },
				{ name: 'v2', branch: 'prototype/dated/v2', createdAt: 'not a date' },
			]),
		});
		const [p] = inProgress(root);
		expect(p?.work.find((i) => i.name === 'v1')?.createdAt).toBe('2026-09-28T17:13:52-04:00');
		expect(p?.work.find((i) => i.name === 'v2')?.createdAt).toBeNull();
	});

	it('reads which picture each prototype has, and nothing that is not one', () => {
		write('pictured', {
			'work.json': JSON.stringify([
				{ name: 'v1', branch: 'prototype/pictured/v1', cover: 'aaaaaaaaaaaa' },
				{ name: 'v5', branch: 'prototype/pictured/v5', cover: '../../etc' },
				{ name: 'v6', branch: 'prototype/pictured/v6' },
			]),
		});
		const [p] = inProgress(root);
		expect(Object.fromEntries(p!.work.map((i) => [i.name, i.cover]))).toEqual({ v1: 'aaaaaaaaaaaa', v5: null, v6: null });
	});

	it('names a project by its id when it has no brief yet', () => {
		write('beta', { 'work.json': JSON.stringify([{ name: 'v1', branch: 'prototype/beta/v1' }]) });
		expect(inProgress(root)[0]?.title).toBe('beta');
	});

	it('skips templates, notes folders with no work, and unreadable records, without failing', () => {
		write('_template', { 'work.json': JSON.stringify([{ name: 'v1', branch: 'x' }]) });
		write('notes', { 'brief.md': '# Just notes' });
		write('broken', { 'work.json': '{not json' });
		write('good', { 'work.json': JSON.stringify([{ name: 'v1', branch: 'prototype/good/v1' }]) });
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
		expect(readFolderProjects(root)[0]).toMatchObject({ title: 'A new view', records: ['brief.md'], work: [] });
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
		// dialog showed as valid and createCodebaseWork then rejected.
		const long = 'Users list inactivity signal for organization administrator review';
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

describe('workOf', () => {
	const work = [
		it1({ name: 'codebase', branch: 'feature/alpha', createdAt: '2026-10-03T00:00:00Z' }),
		it1({ name: 'v1', branch: 'prototype/alpha/v1', createdAt: '2026-10-01T00:00:00Z' }),
		it1({ name: 'v2', branch: 'prototype/alpha/v2', createdAt: '2026-10-02T00:00:00Z' }),
		it1({ name: 'v3', branch: 'prototype/alpha/v3', createdAt: null }),
	];

	it('counts each version as a prototype, the newest first by its number, whatever its record is dated', () => {
		expect(workOf(work, 'prototype').map((i) => i.name)).toEqual(['v3', 'v2', 'v1']);
	});

	it('keeps codebase work on its own', () => {
		expect(workOf(work, 'codebase').map((i) => i.name)).toEqual(['codebase']);
	});
});

describe("a prototype's name: its version", () => {
	it.each([
		['v1', 1],
		['v2', 2],
		['v12', 12],
		['v9999', 9999],
	])('reads %s', (name, version) => {
		expect(parseVersion(name)).toBe(version);
		expect(isPrototypeName(name)).toBe(true);
	});

	// The old shapes are not read at all: a version and its iteration, a name from before versions, and an old branch's.
	it.each(['v1-i1', 'v2-i3', 'i1', 'i7', 'fd/demo/i1', 'codebase', 'v', 'v0', 'v01', 'v10000', 'V1', 'Version 1', 'v1x', 'v-1', '../v1', ''])(
		'refuses %s',
		(name) => {
			expect(parseVersion(name)).toBeNull();
			expect(isPrototypeName(name)).toBe(false);
		},
	);

	it('writes a version as v and its number', () => {
		expect(prototypeName(1)).toBe('v1');
		expect(prototypeName(3)).toBe('v3');
	});

	it('names a new version one past the highest, so no number is reused', () => {
		expect(nextVersionName([])).toBe('v1');
		expect(nextVersionName(['codebase'])).toBe('v1');
		expect(nextVersionName(['v1'])).toBe('v2');
		expect(nextVersionName(['v1', 'v3', 'codebase'])).toBe('v4');
		// What is not a version's name is not counted.
		expect(nextVersionName(['v1-i7', 'i9'])).toBe('v1');
	});

	it('counts the open comments on a version by anyone but its makers, the one acted on aside', () => {
		const noah = { name: 'Noah', login: 'Noah-S' };
		let id = 0;
		const by = (author: string, resolved = false) => ({ author, resolved, thread: 1, id: ++id });
		expect(commentsFromOthers([noah], [])).toBe(0);
		expect(commentsFromOthers([noah], [by('noah-s'), by('NOAH-S')])).toBe(0);
		expect(commentsFromOthers([noah], [by('noah-s'), by('pm'), by('pm')])).toBe(2);
		// A resolved comment has no pin to land wrong, and the one being acted on is the change asked for.
		const acted = by('pm');
		expect(commentsFromOthers([noah], [by('pm', true), acted, by('qa')], acted)).toBe(1);
		// Makers nobody can name are no one's: every comment counts as someone else's.
		expect(commentsFromOthers(undefined, [by('noah-s')])).toBe(1);
		expect(commentsFromOthers([{ name: 'Noah', login: null }], [by('noah-s')])).toBe(1);
		// A bot saw nothing.
		expect(commentsFromOthers([noah], [by('github-actions[bot]')])).toBe(0);
	});

	it('labels a version Version and its number, and codebase work as Codebase', () => {
		expect(workLabel({ name: 'v3' })).toBe('Version 3');
		expect(workLabel({ name: 'codebase' })).toBe('Codebase');
	});
});

describe('matchesProject', () => {
	const alerts = project('alert-history', {
		title: 'Alert history',
		people: [
			{ name: 'Noah Shrader', login: 'noahshrader-flock' },
			{ name: 'Pat Reviewer', login: null },
		],
	});

	it('matches everything for an empty search, and for one of only spaces', () => {
		expect(matchesProject(alerts, '')).toBe(true);
		expect(matchesProject(alerts, '   ')).toBe(true);
	});

	it('matches a part of the name, the id, or a person, without regard to case', () => {
		expect(matchesProject(alerts, 'HISTORY')).toBe(true);
		expect(matchesProject(alerts, 'alert-hist')).toBe(true);
		expect(matchesProject(alerts, 'noah')).toBe(true);
		expect(matchesProject(alerts, 'noahshrader-flock')).toBe(true);
		expect(matchesProject(alerts, 'reviewer')).toBe(true);
	});

	it('needs every word to match, in any order, so narrowing a search narrows the list', () => {
		expect(matchesProject(alerts, 'history alert')).toBe(true);
		expect(matchesProject(alerts, 'alert noah')).toBe(true);
		expect(matchesProject(alerts, 'alert admin')).toBe(false);
	});

	it('matches nothing it does not have, and reads what is typed as text, not as a pattern', () => {
		expect(matchesProject(alerts, 'roles')).toBe(false);
		expect(matchesProject(alerts, '.*')).toBe(false);
		expect(matchesProject(alerts, '(')).toBe(false);
	});
});

describe('when a project was last updated', () => {
	it('is the latest of the activity GitHub knows of and when any version was made', () => {
		const p = project('alpha', {
			updatedAt: '2026-10-05T10:00:00Z',
			work: [it1({ createdAt: '2026-10-07T09:00:00Z' }), it1({ name: 'v2', createdAt: '2026-10-02T09:00:00Z' })],
		});
		expect(lastUpdated(p)).toBe('2026-10-07T09:00:00Z');
		expect(lastUpdated({ ...p, updatedAt: '2026-10-09T00:00:00Z' })).toBe('2026-10-09T00:00:00Z');
	});

	it('is null for a project with nothing dated, and ignores what is not a date', () => {
		expect(lastUpdated(project('alpha', { work: [] }))).toBeNull();
		expect(lastUpdated(project('alpha', { updatedAt: 'someday', work: [it1({ createdAt: null })] }))).toBeNull();
	});
});

describe('sorting the projects', () => {
	const old = project('b-old', { title: 'Banana', updatedAt: '2026-10-01T00:00:00Z', work: [] });
	const fresh = project('a-new', { title: 'apple', updatedAt: '2026-10-08T00:00:00Z', work: [] });
	const never = project('c-none', { title: 'Cherry', work: [] });

	it('puts the project with the most recent activity first, and those with none last', () => {
		expect(sortProjects([never, old, fresh], 'updated').map((p) => p.id)).toEqual(['a-new', 'b-old', 'c-none']);
	});

	it('falls back to the name when two were updated together, so the order never shuffles', () => {
		const same = { updatedAt: '2026-10-08T00:00:00Z', work: [] };
		expect(sortProjects([project('z', { title: 'Zed', ...same }), project('m', { title: 'Mid', ...same })], 'updated').map((p) => p.id)).toEqual([
			'm',
			'z',
		]);
	});

	it('sorts by name, without regard to case, with the id as the last word', () => {
		expect(sortProjects([never, old, fresh], 'alphabetical').map((p) => p.title)).toEqual(['apple', 'Banana', 'Cherry']);
		expect(sortProjects([project('b', { title: 'Same' }), project('a', { title: 'Same' })], 'alphabetical').map((p) => p.id)).toEqual(['a', 'b']);
	});

	it('does not change the list it was given', () => {
		const list = [never, old, fresh];
		sortProjects(list, 'alphabetical');
		expect(list.map((p) => p.id)).toEqual(['c-none', 'b-old', 'a-new']);
	});
});

describe('merging when a project was last updated', () => {
	it('keeps the later of GitHub’s and this machine’s', () => {
		const [m] = mergeProjects([project('alpha', { updatedAt: '2026-10-05T00:00:00Z' })], [project('alpha', { updatedAt: '2026-10-08T00:00:00Z' })]);
		expect(m?.updatedAt).toBe('2026-10-08T00:00:00Z');
		const [n] = mergeProjects([project('alpha', { updatedAt: '2026-10-09T00:00:00Z' })], [project('alpha')]);
		expect(n?.updatedAt).toBe('2026-10-09T00:00:00Z');
	});
});

describe('how a project’s document is named in a menu', () => {
	it('drops the extension, turns dashes into spaces, and capitalizes the first letter only', () => {
		expect(recordLabel('brief.md')).toBe('Brief');
		expect(recordLabel('design-notes.md')).toBe('Design notes');
		expect(recordLabel('audit-v1.md')).toBe('Audit v1');
		expect(recordLabel('work.json')).toBe('Work');
	});
});

describe('the link to codebase work on GitHub', () => {
	const work = (more: Partial<ProjectWork> = {}): ProjectWork => it1({ name: 'codebase', branch: 'feature/alpha', ...more });

	it('is its pull request when one is recorded', () => {
		expect(codeLink(work({ repository: 'flocksafety/flock-coke', pullRequest: 'https://github.com/flocksafety/flock-coke/pull/12' }))).toBe(
			'https://github.com/flocksafety/flock-coke/pull/12',
		);
	});

	it('is otherwise its branch, in the repository the record names', () => {
		expect(codeLink(work({ repository: 'flocksafety/flock-coke' }))).toBe('https://github.com/flocksafety/flock-coke/tree/feature/alpha');
		expect(codeLink(work({ repository: 'flocksafety/flock-coke', branch: 'feature/a b' }))).toBe(
			'https://github.com/flocksafety/flock-coke/tree/feature/a%20b',
		);
	});

	it('is nothing without a repository, or with anything that is not a GitHub repository or pull request', () => {
		expect(codeLink(work())).toBeNull();
		expect(codeLink(work({ repository: '../x' }))).toBeNull();
		expect(codeLink(work({ repository: 'a/b/c' }))).toBeNull();
		expect(codeLink(work({ pullRequest: 'javascript:alert(1)' }))).toBeNull();
		expect(codeLink(work({ repository: 'o/r', pullRequest: 'https://evil.test/o/r/pull/1' }))).toBe('https://github.com/o/r/tree/feature/alpha');
	});
});

describe('the picture on a project’s card', () => {
	const A = 'aaaaaaaaaaaa';
	const B = 'bbbbbbbbbbbb';
	const v = (name: string, day: number, cover: string | null) =>
		it1({ name, branch: `prototype/alpha/${name}`, createdAt: `2026-10-0${day}T00:00:00Z`, cover });

	it('is its newest prototype’s', () => {
		expect(coverToShow(project('alpha', { work: [v('v1', 1, A), v('v2', 2, B)] }))).toEqual({ name: 'v2', cover: B });
	});

	it('is the newest earlier one that has a picture, while the newest has none yet', () => {
		expect(coverToShow(project('alpha', { work: [v('v1', 1, A), v('v5', 2, null)] }))).toEqual({ name: 'v1', cover: A });
	});

	it('is none for a project with no picture, or with only codebase work', () => {
		expect(coverToShow(project('alpha', { work: [v('v1', 1, null)] }))).toBeNull();
		expect(coverToShow(project('alpha', { work: [it1({ name: 'codebase', branch: 'feature/alpha', cover: A })] }))).toBeNull();
		expect(coverToShow(project('alpha', { work: [] }))).toBeNull();
	});

	it('takes the pictures just made into the list, and leaves everything else as it was', () => {
		const list = [project('alpha', { work: [v('v1', 1, null), v('v2', 2, null)] }), project('beta')];
		const after = withCovers(list, [{ projectId: 'alpha', name: 'v2', cover: B }]);
		expect(after[0]?.work.map((i) => i.cover)).toEqual([null, B]);
		expect(after[1]).toBe(list[1]);
		expect(withCovers(list, [])).toBe(list);
	});

	it('reads a picture’s hash, and nothing that is not one', () => {
		expect(asCover('0123456789ab')).toBe('0123456789ab');
		for (const bad of ['0123456789AB', '0123456789a', '../x', 12, null, undefined]) expect(asCover(bad)).toBeNull();
	});
});

describe('what pressing a project does', () => {
	const v = (name: string, day: number) => it1({ name, branch: `prototype/alpha/${name}`, createdAt: `2026-10-0${day}T00:00:00Z` });
	const code = it1({ name: 'codebase', branch: 'feature/alpha', repository: 'flocksafety/flock-coke' });

	it('opens its newest prototype in the app', () => {
		const older = v('v1', 1);
		const newest = v('v5', 2);
		expect(projectOpening(project('alpha', { title: 'Alpha', work: [older, newest, code] }))).toEqual({
			kind: 'app',
			label: 'Open Alpha',
			work: newest,
		});
	});

	it('opens a project with only codebase work on GitHub, in the browser', () => {
		expect(projectOpening(project('alpha', { title: 'Alpha', work: [code] }))).toEqual({
			kind: 'link',
			label: 'Open Alpha on GitHub',
			url: 'https://github.com/flocksafety/flock-coke/tree/feature/alpha',
		});
	});

	it('is nothing for a project with nothing made, or with codebase work that does not say where it is', () => {
		expect(projectOpening(project('alpha', { work: [] }))).toBeNull();
		expect(projectOpening(project('alpha', { work: [{ ...code, repository: null }] }))).toBeNull();
	});
});
