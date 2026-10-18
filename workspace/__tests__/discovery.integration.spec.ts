import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ProjectWork } from '../src/shared/contract';
import type { WorkspaceDescriptor } from '../src/main/services/descriptor';
import { classify, patternToRegex, readBranchProjects } from '../src/main/services/branchProjects';
import { recordsRootFor } from '../src/main/services/discovery';
import { continueWork, readWork } from '../src/main/services/workRecords';
import { unionLocal } from '../src/shared/projectList';
import { projectWork } from './fixtures';

const descriptor: WorkspaceDescriptor = {
	version: 1,
	product: 'Coke',
	contextDir: '.dsnr',
	prototypeRoot: 'src/prototypes',
	branchPattern: { codebase: 'feature/<project-id>' },
	commands: [],
	designSystem: { package: 'x' },
};

describe('finding the design repository', () => {
	it('finds the design repository beside the product, and says null rather than inventing a folder', () => {
		expect(recordsRootFor('/h/GitHub/flock-coke', (p) => p === '/h/GitHub/flock-designer/.git')).toBe('/h/GitHub/flock-designer/projects');
		expect(recordsRootFor('/h/GitHub/flock-coke', () => false)).toBeNull();
	});
});

describe('reading a branch as work', () => {
	it("reads codebase work by the repository's own pattern", () => {
		expect(classify(descriptor, 'feature/unused-roles-signal')).toEqual({
			projectId: 'unused-roles-signal',
			name: 'codebase',
			branch: 'feature/unused-roles-signal',
		});
	});
	it('does not mistake ordinary branches, or the prototype branches of old, for work', () => {
		for (const b of ['develop', 'main', 'noah/flock-designer', 'fd/x', 'feature/Bad Name', 'fd/a/b/i1', 'fd/users/i2', 'prototype/users/v2'])
			expect(classify(descriptor, b)).toBeNull();
	});
	it('builds a matcher from any pattern', () => {
		expect(patternToRegex('work/<project-id>').test('work/my-thing')).toBe(true);
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
		writeFileSync(join(root, 'a.txt'), 'a');
		g('add', '.');
		g('commit', '-q', '-m', 'first');
		g('checkout', '-q', '-b', 'feature/real-change');
		commitAs('Ada Lovelace', 'b.txt');
		commitAs('Grace Hopper', 'c.txt');
		g('checkout', '-q', 'develop');
	});
	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
		rmSync(records, { recursive: true, force: true });
	});

	it('lists it as a project, with its work and who committed', async () => {
		const [p] = await readBranchProjects(root, descriptor, null, new Set(['real-change']));
		expect(p?.id).toBe('real-change');
		expect(p?.work.map((i) => i.name)).toEqual(['codebase']);
		expect(p?.people.map((x) => x.name).sort()).toEqual(['Ada Lovelace', 'Grace Hopper']);
		expect(p?.work[0]?.commit).toMatch(/^[0-9a-f]{40}$/);
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

	it('lists nothing that no project vouches for', async () => {
		expect(await readBranchProjects(root, descriptor, null, new Set())).toEqual([]);
	});

	it('credits the person running the app with their login', async () => {
		g('config', 'user.name', 'Grace Hopper');
		const [p] = await readBranchProjects(root, descriptor, 'ghopper', new Set(['real-change']));
		expect(p?.people.find((x) => x.name === 'Grace Hopper')?.login).toBe('ghopper');
	});

	it('opens work that has a branch but no record, and writes the record then', async () => {
		expect(readWork(records, 'real-change')).toEqual([]);
		const opened = await continueWork(root, records, 'real-change', 'codebase', null, descriptor);
		expect(opened.branch).toBe('feature/real-change');
		expect(readWork(records, 'real-change').map((i) => i.name)).toEqual(['codebase']);
	});

	it('still refuses work that has no record, and is not codebase work on its branch', async () => {
		await expect(continueWork(root, records, 'real-change', 'v9', null, descriptor)).rejects.toThrow(/real-change has no v9\./);
	});
});

describe('unionLocal', () => {
	const it1 = (branch: string, over: Partial<ProjectWork> = {}): ProjectWork => projectWork({ name: 'v1', branch, ...over });
	it('keeps what a record says and adds branches it did not know about', () => {
		const rec = [
			{
				id: 'a',
				title: 'A, from the brief',
				folder: null,
				records: ['brief.md'],
				work: [it1('prototype/a/v1', { previewUrl: 'https://p' })],
				people: [],
			},
		];
		const git = [
			{ id: 'a', title: 'a', folder: null, records: [], work: [it1('prototype/a/v1', { commit: 'abc' }), it1('prototype/a/v2')], people: [] },
		];
		const [u] = unionLocal(rec, git);
		expect(u?.title).toBe('A, from the brief');
		expect(u?.work.find((i) => i.branch === 'prototype/a/v1')).toMatchObject({ previewUrl: 'https://p', commit: 'abc' });
		expect(u?.work).toHaveLength(2);
	});
});

void mkdirSync;
