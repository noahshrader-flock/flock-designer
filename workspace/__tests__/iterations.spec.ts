import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { WorkspaceDescriptor } from '../src/shared/contract';
import { readCheckout } from '../src/main/services/git';
import {
	IterationProblem,
	assertUsableProjectId,
	branchFor,
	codebaseBranchFor,
	continueIteration,
	createIteration,
	readIterations,
	recordPreview,
	recordedIteration,
} from '../src/main/services/iterations';

const descriptor: WorkspaceDescriptor = {
	version: 1,
	product: 'Coke',
	contextDir: '.flkd',
	prototypeRoot: 'src/prototypes',
	branchPattern: { prototype: 'fd/<project-id>/i<n>', codebase: 'feature/<project-id>' },
	commands: [],
	designSystem: { package: '@flocksafety/flock-react-component-lib' },
};

let root: string;
let records: string;
const g = (...args: string[]) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' });

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), 'fdw-iter-'));
	records = mkdtempSync(join(tmpdir(), 'fdw-records-'));
	g('init', '-q', '-b', 'develop');
	g('config', 'user.email', 'test@example.test');
	g('config', 'user.name', 'Test');
	writeFileSync(join(root, 'README.md'), '# repo\n');
	g('add', '.');
	g('commit', '-q', '-m', 'first');
});

/**
 * An old prototype: its `fd/` branch, recorded the way the app adopts one it finds. Prototypes are no longer made
 * on branches, but the ones that were are still opened, continued and shared.
 */
const oldPrototype = async (n: number) => {
	g('checkout', '-q', '-b', `fd/demo/i${n}`, 'develop');
	const it = await recordedIteration(root, records, descriptor, 'demo', `i${n}`);
	g('checkout', '-q', 'develop');
	return it;
};

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
		expect(() => assertUsableProjectId(id)).toThrow(IterationProblem);
	});
});

describe('branchFor', () => {
	it('uses the repository\'s own pattern rather than a hard-coded one', () => {
		expect(branchFor(descriptor, 'demo', 2)).toBe('fd/demo/i2');
		const other = { ...descriptor, branchPattern: { prototype: 'proto/<project-id>-<n>', codebase: 'x' } };
		expect(branchFor(other, 'demo', 2)).toBe('proto/demo-2');
	});
});

describe('createIteration', () => {
	it('records which GitHub repository the work is in, from the checkout’s origin, so it can be linked to', async () => {
		g('remote', 'add', 'origin', 'git@github.com:FlockSafety/flock-coke.git');
		const made = await createIteration(root, records, descriptor, 'demo', 'first try', 'develop');
		expect(made.repository).toBe('FlockSafety/flock-coke');
		expect(readIterations(records, 'demo')[0]?.repository).toBe('FlockSafety/flock-coke');
	});

	it('records no repository for a checkout with no GitHub origin', async () => {
		const made = await createIteration(root, records, descriptor, 'demo', 'first try', 'develop');
		expect(made).not.toHaveProperty('repository');
	});

	it('records the work in the design repository, not in the product checkout', async () => {
		await createIteration(root, records, descriptor, 'demo', 'first try', 'develop');
		// The record lives with the design record, NOT in the product checkout --
		// putting it there dirties the tree and blocks the next piece of work.
		expect(existsSync(join(records, 'demo/iterations.json'))).toBe(true);
		expect(existsSync(join(root, '.flkd/projects/demo/iterations.json'))).toBe(false);
		expect((await readCheckout(root)).clean).toBe(true);
	});

	it('writes plain JSON anyone can read without this app', async () => {
		await createIteration(root, records, descriptor, 'demo', 'first', 'develop');
		expect(JSON.parse(readFileSync(join(records, 'demo/iterations.json'), 'utf8'))[0].note).toBe('first');
	});

	it('survives switching branches, which a record on the branch would not', async () => {
		await createIteration(root, records, descriptor, 'demo', 'first', 'develop');
		g('checkout', '-q', 'develop');
		expect(readIterations(records, 'demo')).toHaveLength(1);
	});
});

describe('continueIteration', () => {
	it('switches back and records where the branch now is', async () => {
		await oldPrototype(1);
		g('checkout', '-q', 'fd/demo/i1');
		writeFileSync(join(root, 'work.txt'), 'done\n');
		g('add', '.');
		g('commit', '-q', '-m', 'work');
		g('checkout', '-q', 'develop');

		const back = await continueIteration(root, records, 'demo', 'i1');
		expect((await readCheckout(root)).branch).toBe('fd/demo/i1');
		expect(back.commit).toMatch(/^[0-9a-f]{40}$/);
		expect(readIterations(records, 'demo')[0]?.commit).toBe(back.commit);
	});

	it('refuses an iteration it has no record of', async () => {
		await expect(continueIteration(root, records, 'demo', 'i9')).rejects.toThrow(/no iteration called i9/);
	});
});

describe('codebase work', () => {
	it('creates the one feature branch and records it as "codebase"', async () => {
		const it = await createIteration(root, records, descriptor, 'demo', 'real change', 'develop');
		expect(it.name).toBe('codebase');
		expect(it.branch).toBe(codebaseBranchFor(descriptor, 'demo'));
		expect((await readCheckout(root)).branch).toBe('feature/demo');
		expect(readIterations(records, 'demo')).toHaveLength(1);
	});

	it('adopts a feature branch someone already made by hand, keeping its commits', async () => {
		g('checkout', '-q', '-b', 'feature/demo');
		writeFileSync(join(root, 'work.txt'), 'x\n');
		g('add', '.');
		g('commit', '-q', '-m', 'by hand');
		const head = g('rev-parse', 'HEAD').trim();
		g('checkout', '-q', 'develop');

		await createIteration(root, records, descriptor, 'demo', '', 'develop');
		expect(g('rev-parse', 'feature/demo').trim()).toBe(head);
		expect(readIterations(records, 'demo')[0]?.name).toBe('codebase');
	});

	it('refuses a second codebase record for the same project', async () => {
		await createIteration(root, records, descriptor, 'demo', '', 'develop');
		g('checkout', '-q', 'develop');
		await expect(createIteration(root, records, descriptor, 'demo', '', 'develop')).rejects.toThrow(
			/already has codebase work/,
		);
	});

	it('records nothing when a dirty tree stops the switch', async () => {
		writeFileSync(join(root, 'README.md'), 'uncommitted\n');
		await expect(createIteration(root, records, descriptor, 'demo', '', 'develop')).rejects.toThrow(/uncommitted/);
		expect(readIterations(records, 'demo')).toEqual([]);
	});

});

describe('recordPreview', () => {
	it('saves the address on the named iteration and leaves the others alone', async () => {
		await oldPrototype(1);
		await oldPrototype(2);
		const saved = recordPreview(records, 'demo', 'i1', 'https://dev-coke-pr-5.example.test');
		expect(saved.previewUrl).toBe('https://dev-coke-pr-5.example.test');
		const all = readIterations(records, 'demo');
		expect(all.find((i) => i.name === 'i1')?.previewUrl).toBe('https://dev-coke-pr-5.example.test');
		expect(all.find((i) => i.name === 'i2')?.previewUrl).toBeUndefined();
	});

	it('survives the record being refreshed when the iteration is opened again', async () => {
		await oldPrototype(1);
		recordPreview(records, 'demo', 'i1', 'https://dev-coke-pr-5.example.test');
		await continueIteration(root, records, 'demo', 'i1');
		expect(readIterations(records, 'demo')[0]?.previewUrl).toBe('https://dev-coke-pr-5.example.test');
	});

	it('records the commit that was shared, so a comment can say what it was made against', async () => {
		await oldPrototype(1);
		recordPreview(records, 'demo', 'i1', 'https://dev-coke-pr-5.example.test', 'abc123');
		expect(readIterations(records, 'demo')[0]).toMatchObject({ previewUrl: 'https://dev-coke-pr-5.example.test', commit: 'abc123' });
	});

	it('records the pull request it was built from, which the project page links to', async () => {
		await oldPrototype(1);
		recordPreview(records, 'demo', 'i1', 'https://x.example.test', 'abc123', 'https://github.com/o/r/pull/5');
		expect(readIterations(records, 'demo')[0]?.pullRequest).toBe('https://github.com/o/r/pull/5');
	});

	it('leaves the commit alone when none is given', async () => {
		await oldPrototype(1);
		recordPreview(records, 'demo', 'i1', 'https://x.example.test');
		expect(readIterations(records, 'demo')[0]?.commit).toBeNull();
	});

	it('refuses an iteration that is not recorded rather than inventing one', () => {
		expect(() => recordPreview(records, 'demo', 'i9', 'https://x.example.test')).toThrow(IterationProblem);
	});
});

describe('recordedIteration: work started outside the app', () => {
	it('records codebase work an agent built in a terminal, even with the checkout already on its branch', async () => {
		g('checkout', '-q', '-b', 'feature/new-view');
		writeFileSync(join(root, 'view.tsx'), 'x');
		g('add', '.');
		g('commit', '-q', '-m', 'build the view');
		expect(readIterations(records, 'new-view')).toEqual([]);

		const found = await recordedIteration(root, records, descriptor, 'new-view', 'codebase');
		expect(found).toMatchObject({ projectId: 'new-view', name: 'codebase', branch: 'feature/new-view' });
		expect(readIterations(records, 'new-view')).toHaveLength(1);
		expect((await readCheckout(root)).branch).toBe('feature/new-view'); // nothing was switched
	});

	it('dates adopted work from the work itself, not from when the app first needed a record', async () => {
		g('checkout', '-q', '-b', 'feature/old-work');
		writeFileSync(join(root, 'old.txt'), 'x');
		g('add', '.');
		execFileSync('git', ['-C', root, 'commit', '-q', '-m', 'old'], { env: { ...process.env, GIT_AUTHOR_DATE: '2026-09-02T08:00:00+00:00', GIT_COMMITTER_DATE: '2026-09-02T08:00:00+00:00' } });
		const found = await recordedIteration(root, records, descriptor, 'old-work', 'codebase');
		expect(new Date(found.createdAt).toISOString()).toBe('2026-09-02T08:00:00.000Z');
	});

	it('records a numbered prototype the same way', async () => {
		g('checkout', '-q', '-b', 'fd/demo/i3');
		const found = await recordedIteration(root, records, descriptor, 'demo', 'i3');
		expect(found).toMatchObject({ name: 'i3', branch: 'fd/demo/i3' });
	});

	it('never reads a version name as an older prototype branch', async () => {
		// An fd/ branch exists, but a name in the new form is a page, never a branch: no record is invented for it.
		g('checkout', '-q', '-b', 'fd/demo/i2');
		await expect(recordedIteration(root, records, descriptor, 'demo', 'v1-i2')).rejects.toThrow(/no iteration called v1-i2/);
		expect(readIterations(records, 'demo')).toEqual([]);
	});

	it('returns an existing record as it is, and does not write a second', async () => {
		await oldPrototype(1);
		const before = readFileSync(join(records, 'demo', 'iterations.json'), 'utf8');
		const found = await recordedIteration(root, records, descriptor, 'demo', 'i1');
		expect(found.branch).toBe('fd/demo/i1');
		expect(readFileSync(join(records, 'demo', 'iterations.json'), 'utf8')).toBe(before);
	});

	it('refuses work whose branch is not there, rather than inventing a record for it', async () => {
		await expect(recordedIteration(root, records, descriptor, 'demo', 'i7')).rejects.toThrow(/no iteration called i7/);
		await expect(recordedIteration(root, records, descriptor, 'demo', 'codebase')).rejects.toThrow(IterationProblem);
		expect(existsSync(join(records, 'demo', 'iterations.json'))).toBe(false);
	});

	it('does not record a name that could mean anything else', async () => {
		await expect(recordedIteration(root, records, descriptor, 'demo', '../../etc')).rejects.toThrow();
	});
});

