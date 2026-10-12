import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { WorkspaceDescriptor } from '../src/shared/contract';
import { classify, patternToRegex, readBranchProjects } from '../src/main/services/branchProjects';
import { findProductCheckouts, recordsRootFor, type DiscoveryDeps } from '../src/main/services/discovery';
import { continueIteration, readIterations } from '../src/main/services/iterations';
import { unionLocal } from '../src/shared/projects';

const descriptor: WorkspaceDescriptor = {
	version: 1,
	product: 'Coke',
	contextDir: '.dsnr',
	prototypeRoot: 'src/prototypes',
	branchPattern: { prototype: 'fd/<project-id>/i<n>', codebase: 'feature/<project-id>' },
	commands: [],
	designSystem: { package: 'x' },
};

describe('finding the product repository', () => {
	const fake = (tree: Record<string, string[]>, activity: Record<string, number> = {}): DiscoveryDeps => ({
		home: '/h',
		exists: (p) => Object.values(tree).some((files) => files.includes(p)),
		list: (dir) =>
			Object.keys(tree)
				.filter((d) => d.startsWith(`${dir}/`) && !d.slice(dir.length + 1).includes('/'))
				.map((d) => d.slice(dir.length + 1)),
		activity: (r) => activity[r] ?? 0,
	});
	const product = (dir: string) => [`${dir}/.git`, `${dir}/.dsnr/workspace.json`];

	it('finds a repository once when two of the usual places are one folder, as GitHub and github are on macOS', () => {
		const tree = { '/h/GitHub/flock-coke': product('/h/GitHub/flock-coke'), '/h/github/flock-coke': product('/h/github/flock-coke') };
		const deps = { ...fake(tree), real: (p: string) => p.toLowerCase() };
		expect(findProductCheckouts(deps)).toEqual(['/h/GitHub/flock-coke']);
	});

	it('looks first in the folder this person’s clones go in, wherever that is', () => {
		const deps = { ...fake({ '/Volumes/work/flock-coke': product('/Volumes/work/flock-coke') }), folders: ['/Volumes/work'] };
		expect(findProductCheckouts(deps)).toEqual(['/Volumes/work/flock-coke']);
		expect(findProductCheckouts({ ...deps, folders: [] })).toEqual([]);
	});

	it('finds a repository by the file that says it can be worked in, wherever the usual places put it', () => {
		const deps = fake({ '/h/Documents/GitHub/flock-coke': product('/h/Documents/GitHub/flock-coke') });
		expect(findProductCheckouts(deps)).toEqual(['/h/Documents/GitHub/flock-coke']);
	});

	it('ignores repositories without the marker, and folders that are not repositories', () => {
		const deps = fake({
			'/h/Documents/GitHub/other': ['/h/Documents/GitHub/other/.git'],
			'/h/Documents/GitHub/loose': ['/h/Documents/GitHub/loose/.dsnr/workspace.json'],
		});
		expect(findProductCheckouts(deps)).toEqual([]);
	});

	it('puts the most recently used first when there are several', () => {
		const deps = fake({ '/h/code/old': product('/h/code/old'), '/h/code/new': product('/h/code/new') }, { '/h/code/old': 1, '/h/code/new': 9 });
		expect(findProductCheckouts(deps)).toEqual(['/h/code/new', '/h/code/old']);
	});

	it('finds the design repository beside it, and says null rather than inventing a folder', () => {
		expect(recordsRootFor('/h/GitHub/flock-coke', (p) => p === '/h/GitHub/flock-designer/.git')).toBe('/h/GitHub/flock-designer/projects');
		expect(recordsRootFor('/h/GitHub/flock-coke', () => false)).toBeNull();
	});
});

describe('reading a branch as work', () => {
	it("uses the repository's own patterns", () => {
		expect(classify(descriptor, 'fd/users-inactivity-signal/i2')).toEqual({
			projectId: 'users-inactivity-signal',
			name: 'i2',
			branch: 'fd/users-inactivity-signal/i2',
		});
		expect(classify(descriptor, 'feature/unused-roles-signal')).toMatchObject({ projectId: 'unused-roles-signal', name: 'codebase' });
	});
	it('does not mistake ordinary branches for work', () => {
		for (const b of ['develop', 'main', 'noah/flock-designer', 'fd/x', 'feature/Bad Name', 'fd/a/b/i1']) expect(classify(descriptor, b)).toBeNull();
	});
	it('builds a matcher from any pattern', () => {
		expect(patternToRegex('work/<project-id>/v<n>').test('work/my-thing/v3')).toBe(true);
	});
});

describe('work found in a real repository, with no record written', () => {
	let root: string;
	let records: string;
	const g = (...args: string[]) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' });
	const commitAs = (name: string, file: string) => {
		writeFileSync(join(root, file), `${name}\n`);
		g('add', '.');
		g('-c', `user.name=${name}`, '-c', 'user.email=x@example.test', 'commit', '-q', '-m', name);
	};
	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'fdw-found-'));
		records = mkdtempSync(join(tmpdir(), 'fdw-found-rec-'));
		g('init', '-q', '-b', 'develop');
		g('config', 'user.email', 't@example.test');
		g('config', 'user.name', 'Test');
		writeFileSync(join(root, 'a.txt'), 'a');
		g('add', '.');
		g('commit', '-q', '-m', 'first');
		g('checkout', '-q', '-b', 'feature/real-change');
		commitAs('Ada Lovelace', 'b.txt');
		g('checkout', '-q', 'develop');
		g('checkout', '-q', '-b', 'fd/real-change/i1');
		commitAs('Grace Hopper', 'c.txt');
		g('checkout', '-q', 'develop');
	});
	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
		rmSync(records, { recursive: true, force: true });
	});

	it('lists it as a project, with its iterations and who committed', async () => {
		const [p] = await readBranchProjects(root, descriptor, null, new Set(['real-change']));
		expect(p?.id).toBe('real-change');
		expect(p?.iterations.map((i) => i.name)).toEqual(['i1', 'codebase']);
		expect(p?.people.map((x) => x.name).sort()).toEqual(['Ada Lovelace', 'Grace Hopper']);
		expect(p?.iterations[0]?.commit).toMatch(/^[0-9a-f]{40}$/);
	});

	it("ignores a feature branch no project vouches for, so teammates' tickets stay out", async () => {
		// `feature/<project-id>` is how the whole product team names ticket branches.
		g('checkout', '-q', '-b', 'feature/dda-1221');
		commitAs('Someone Else', 'd.txt');
		g('checkout', '-q', 'develop');

		const known = new Set(['real-change']);
		const ids = (await readBranchProjects(root, descriptor, null, known)).map((p) => p.id);
		expect(ids).not.toContain('dda-1221');
		expect(ids).toContain('real-change');
	});

	it('still shows a prototype branch with no record, which only this app creates', async () => {
		const [p] = await readBranchProjects(root, descriptor, null, new Set());
		expect(p?.id).toBe('real-change');
		expect(p?.iterations.map((i) => i.name)).toEqual(['i1']);
	});

	it('credits the person running the app with their login', async () => {
		g('config', 'user.name', 'Grace Hopper');
		const [p] = await readBranchProjects(root, descriptor, 'ghopper');
		expect(p?.people.find((x) => x.name === 'Grace Hopper')?.login).toBe('ghopper');
	});

	it('opens work that has a branch but no record, and writes the record then', async () => {
		expect(readIterations(records, 'real-change')).toEqual([]);
		const opened = await continueIteration(root, records, 'real-change', 'codebase', null, descriptor);
		expect(opened.branch).toBe('feature/real-change');
		expect(readIterations(records, 'real-change').map((i) => i.name)).toEqual(['codebase']);
	});

	it('still refuses an iteration that has neither a record nor a branch', async () => {
		await expect(continueIteration(root, records, 'real-change', 'i9', null, descriptor)).rejects.toThrow(/no iteration called i9/);
	});
});

describe('unionLocal', () => {
	const it1 = (branch: string, over = {}) => ({ name: 'i1', branch, issueNumber: null, previewUrl: null, commit: null, contributors: [], ...over });
	it('keeps what a record says and adds branches it did not know about', () => {
		const rec = [
			{ id: 'a', title: 'A, from the brief', records: ['brief.md'], iterations: [it1('fd/a/i1', { previewUrl: 'https://p' })], people: [] },
		];
		const git = [{ id: 'a', title: 'a', records: [], iterations: [it1('fd/a/i1', { commit: 'abc' }), it1('fd/a/i2')], people: [] }];
		const [u] = unionLocal(rec, git);
		expect(u?.title).toBe('A, from the brief');
		expect(u?.iterations.find((i) => i.branch === 'fd/a/i1')).toMatchObject({ previewUrl: 'https://p', commit: 'abc' });
		expect(u?.iterations).toHaveLength(2);
	});
});

void mkdirSync;
