import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { WorkspaceDescriptor } from '../src/core/services/projects/descriptor';
import { readCheckout } from '../src/core/services/platform/git';
import {
	assertUsableProjectId,
	codebaseBranchFor,
	continueWork,
	createCodebaseWork,
	readWork,
	recordPreview,
	recordedWork,
} from '../src/core/services/projects/workRecords';
import { g } from './fixtures';

const descriptor: WorkspaceDescriptor = {
	version: 1,
	product: 'Coke',
	contextDir: '.dsnr',
	branchPattern: { codebase: 'feature/<project-id>' },
	commands: [],
	designSystem: { package: '@flocksafety/flock-react-component-lib' },
};

let root: string;
let records: string;

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), 'fdw-iter-'));
	records = mkdtempSync(join(tmpdir(), 'fdw-records-'));
	g(root, 'init', '-q', '-b', 'develop');
	writeFileSync(join(root, 'README.md'), '# repo\n');
	g(root, 'add', '.');
	g(root, 'commit', '-q', '-m', 'first');
});

const codebase = async () => {
	const made = await createCodebaseWork(root, records, descriptor, 'demo', 'real change', 'develop');
	g(root, 'checkout', '-q', 'develop');
	return made;
};
const version = (name: string) =>
	writeFileSync(
		join(records, 'demo', 'work.json'),
		JSON.stringify([
			...readWork(records, 'demo'),
			{ projectId: 'demo', name, branch: `prototype/demo/${name}`, commit: null, createdAt: '', note: '' },
		]),
	);

afterEach(() => {
	rmSync(root, { recursive: true, force: true });
	rmSync(records, { recursive: true, force: true });
});

describe('project ids', () => {
	it.each(['users-inactivity-signal', 'orgs', 'a1-b2'])('accepts %s', (id) => {
		expect(() => assertUsableProjectId(id)).not.toThrow();
	});

	it.each(['../escape', 'Has Caps', 'trailing-', 'semi;colon', ''])('refuses %s', (id) => {
		// The id becomes both a directory and a branch name, so anything that could
		// escape either has to fail here rather than downstream.
		expect(() => assertUsableProjectId(id)).toThrow(/is not a usable project id/);
	});
});

describe('codebaseBranchFor', () => {
	it("uses the repository's own pattern rather than a hard-coded one", () => {
		expect(codebaseBranchFor(descriptor, 'demo')).toBe('feature/demo');
		expect(codebaseBranchFor({ ...descriptor, branchPattern: { codebase: 'work/<project-id>' } }, 'demo')).toBe('work/demo');
	});
});

describe('createCodebaseWork', () => {
	it('records which GitHub repository the work is in, from the checkout’s origin, so it can be linked to', async () => {
		g(root, 'remote', 'add', 'origin', 'git@github.com:FlockSafety/flock-coke.git');
		const made = await createCodebaseWork(root, records, descriptor, 'demo', 'first try', 'develop');
		expect(made.repository).toBe('FlockSafety/flock-coke');
		expect(readWork(records, 'demo')[0]?.repository).toBe('FlockSafety/flock-coke');
	});

	it('records no repository for a checkout with no GitHub origin', async () => {
		const made = await createCodebaseWork(root, records, descriptor, 'demo', 'first try', 'develop');
		expect(made).not.toHaveProperty('repository');
	});

	it('records the work in the design repository, not in the product checkout', async () => {
		await createCodebaseWork(root, records, descriptor, 'demo', 'first try', 'develop');
		// In the product checkout it would dirty the tree and block the next piece of work.
		expect(existsSync(join(records, 'demo/work.json'))).toBe(true);
		expect(existsSync(join(root, '.dsnr/projects/demo/work.json'))).toBe(false);
		expect((await readCheckout(root)).clean).toBe(true);
	});

	it('writes plain JSON anyone can read without this app', async () => {
		await createCodebaseWork(root, records, descriptor, 'demo', 'first', 'develop');
		expect(JSON.parse(readFileSync(join(records, 'demo/work.json'), 'utf8'))[0].note).toBe('first');
	});

	it('survives switching branches, which a record on the branch would not', async () => {
		await createCodebaseWork(root, records, descriptor, 'demo', 'first', 'develop');
		g(root, 'checkout', '-q', 'develop');
		expect(readWork(records, 'demo')).toHaveLength(1);
	});
});

describe('continueWork', () => {
	it('switches back and records where the branch now is', async () => {
		await codebase();
		g(root, 'checkout', '-q', 'feature/demo');
		writeFileSync(join(root, 'work.txt'), 'done\n');
		g(root, 'add', '.');
		g(root, 'commit', '-q', '-m', 'work');
		g(root, 'checkout', '-q', 'develop');

		const back = await continueWork(root, records, 'demo', 'codebase', null, descriptor);
		expect((await readCheckout(root)).branch).toBe('feature/demo');
		expect(back.commit).toMatch(/^[0-9a-f]{40}$/);
		expect(readWork(records, 'demo')[0]?.commit).toBe(back.commit);
	});

	it('refuses work it has no record of', async () => {
		await expect(continueWork(root, records, 'demo', 'v9', null, descriptor)).rejects.toThrow(/demo has no v9\./);
	});
});

describe('codebase work', () => {
	it('creates the one feature branch and records it as "codebase"', async () => {
		const created = await createCodebaseWork(root, records, descriptor, 'demo', 'real change', 'develop');
		expect(created.name).toBe('codebase');
		expect(created.branch).toBe(codebaseBranchFor(descriptor, 'demo'));
		expect((await readCheckout(root)).branch).toBe('feature/demo');
		expect(readWork(records, 'demo')).toHaveLength(1);
	});

	it('adopts a feature branch someone already made by hand, keeping its commits', async () => {
		g(root, 'checkout', '-q', '-b', 'feature/demo');
		writeFileSync(join(root, 'work.txt'), 'x\n');
		g(root, 'add', '.');
		g(root, 'commit', '-q', '-m', 'by hand');
		const head = g(root, 'rev-parse', 'HEAD').trim();
		g(root, 'checkout', '-q', 'develop');

		await createCodebaseWork(root, records, descriptor, 'demo', '', 'develop');
		expect(g(root, 'rev-parse', 'feature/demo').trim()).toBe(head);
		expect(readWork(records, 'demo')[0]?.name).toBe('codebase');
	});

	it('refuses a second codebase record for the same project', async () => {
		await createCodebaseWork(root, records, descriptor, 'demo', '', 'develop');
		g(root, 'checkout', '-q', 'develop');
		await expect(createCodebaseWork(root, records, descriptor, 'demo', '', 'develop')).rejects.toThrow(/already has codebase work/);
	});

	it('records nothing when a dirty tree stops the switch', async () => {
		writeFileSync(join(root, 'README.md'), 'uncommitted\n');
		await expect(createCodebaseWork(root, records, descriptor, 'demo', '', 'develop')).rejects.toThrow(/uncommitted/);
		expect(readWork(records, 'demo')).toEqual([]);
	});
});

describe('recordPreview', () => {
	it('saves the address on the work named and leaves the others alone', async () => {
		await codebase();
		version('v1');
		const saved = recordPreview(records, 'demo', 'codebase', 'https://dev-coke-pr-5.example.test');
		expect(saved.previewUrl).toBe('https://dev-coke-pr-5.example.test');
		const all = readWork(records, 'demo');
		expect(all.find((i) => i.name === 'codebase')?.previewUrl).toBe('https://dev-coke-pr-5.example.test');
		expect(all.find((i) => i.name === 'v1')?.previewUrl).toBeUndefined();
	});

	it('survives the record being refreshed when the work is opened again', async () => {
		await codebase();
		recordPreview(records, 'demo', 'codebase', 'https://dev-coke-pr-5.example.test');
		await continueWork(root, records, 'demo', 'codebase', null, descriptor);
		expect(readWork(records, 'demo')[0]?.previewUrl).toBe('https://dev-coke-pr-5.example.test');
	});

	it('records the commit that was shared, so a comment can say what it was made against', async () => {
		await codebase();
		recordPreview(records, 'demo', 'codebase', 'https://dev-coke-pr-5.example.test', 'abc123');
		expect(readWork(records, 'demo')[0]).toMatchObject({ previewUrl: 'https://dev-coke-pr-5.example.test', commit: 'abc123' });
	});

	it('records the pull request it was built from, which the project page links to', async () => {
		await codebase();
		recordPreview(records, 'demo', 'codebase', 'https://x.example.test', 'abc123', 'https://github.com/o/r/pull/5');
		expect(readWork(records, 'demo')[0]?.pullRequest).toBe('https://github.com/o/r/pull/5');
	});

	it('leaves the commit alone when none is given', async () => {
		await codebase();
		recordPreview(records, 'demo', 'codebase', 'https://x.example.test');
		expect(readWork(records, 'demo')[0]?.commit).toBeNull();
	});

	it('refuses work that is not recorded rather than inventing it', () => {
		expect(() => recordPreview(records, 'demo', 'v9', 'https://x.example.test')).toThrow(/demo has no v9\./);
	});
});

describe('recordedWork: work started outside the app', () => {
	it('records codebase work an agent built in a terminal, even with the checkout already on its branch', async () => {
		g(root, 'checkout', '-q', '-b', 'feature/new-view');
		writeFileSync(join(root, 'view.tsx'), 'x');
		g(root, 'add', '.');
		g(root, 'commit', '-q', '-m', 'build the view');
		expect(readWork(records, 'new-view')).toEqual([]);

		const found = await recordedWork(root, records, descriptor, 'new-view', 'codebase');
		expect(found).toMatchObject({ projectId: 'new-view', name: 'codebase', branch: 'feature/new-view' });
		expect(readWork(records, 'new-view')).toHaveLength(1);
		expect((await readCheckout(root)).branch).toBe('feature/new-view');
	});

	it('dates adopted work from the work itself, not from when the app first needed a record', async () => {
		g(root, 'checkout', '-q', '-b', 'feature/old-work');
		writeFileSync(join(root, 'old.txt'), 'x');
		g(root, 'add', '.');
		execFileSync('git', ['-C', root, 'commit', '-q', '-m', 'old'], {
			env: { ...process.env, GIT_AUTHOR_DATE: '2026-09-02T08:00:00+00:00', GIT_COMMITTER_DATE: '2026-09-02T08:00:00+00:00' },
		});
		const found = await recordedWork(root, records, descriptor, 'old-work', 'codebase');
		expect(new Date(found.createdAt).toISOString()).toBe('2026-09-02T08:00:00.000Z');
	});

	it('never makes a version from a branch: a version is a page', async () => {
		g(root, 'checkout', '-q', '-b', 'prototype/demo/v2', 'develop');
		await expect(recordedWork(root, records, descriptor, 'demo', 'v2')).rejects.toThrow(/demo has no v2\./);
		expect(readWork(records, 'demo')).toEqual([]);
	});

	it('returns an existing record as it is, and does not write a second', async () => {
		await codebase();
		const before = readFileSync(join(records, 'demo', 'work.json'), 'utf8');
		const found = await recordedWork(root, records, descriptor, 'demo', 'codebase');
		expect(found.branch).toBe('feature/demo');
		expect(readFileSync(join(records, 'demo', 'work.json'), 'utf8')).toBe(before);
	});

	it('refuses work whose branch is not there, rather than inventing a record for it', async () => {
		await expect(recordedWork(root, records, descriptor, 'demo', 'v7')).rejects.toThrow(/demo has no v7\./);
		await expect(recordedWork(root, records, descriptor, 'demo', 'codebase')).rejects.toThrow(/demo has no codebase\./);
		expect(existsSync(join(records, 'demo', 'work.json'))).toBe(false);
	});

	it('does not record a name that could mean anything else', async () => {
		await expect(recordedWork(root, records, descriptor, 'demo', '../../etc')).rejects.toThrow();
	});
});
