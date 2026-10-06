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
	it('creates i1, switches to its branch, and records it in the repository', async () => {
		const it1 = await createIteration(root, records, descriptor, 'demo', 'first try', 'develop');
		expect(it1.name).toBe('i1');
		expect(it1.branch).toBe('fd/demo/i1');
		expect((await readCheckout(root)).branch).toBe('fd/demo/i1');
		// The record lives with the design record, NOT in the product checkout --
		// putting it there dirties the tree and blocks the next iteration.
		expect(existsSync(join(records, 'demo/iterations.json'))).toBe(true);
		expect(existsSync(join(root, '.flkd/projects/demo/iterations.json'))).toBe(false);
		expect((await readCheckout(root)).clean).toBe(true);
		expect(readIterations(records, 'demo')).toHaveLength(1);
	});

	it('numbers the next one from what is already recorded', async () => {
		await createIteration(root, records, descriptor, 'demo', 'first', 'develop');
		g('checkout', '-q', 'develop');
		const it2 = await createIteration(root, records, descriptor, 'demo', 'second', 'develop');
		expect(it2.name).toBe('i2');
		expect(readIterations(records, 'demo').map((i) => i.name)).toEqual(['i1', 'i2']);
	});

	it('records nothing when the branch could not be created', async () => {
		writeFileSync(join(root, 'README.md'), 'uncommitted\n');
		await expect(createIteration(root, records, descriptor, 'demo', 'x', 'develop')).rejects.toThrow(/uncommitted/);
		// The record must not claim an iteration that does not exist.
		expect(readIterations(records, 'demo')).toEqual([]);
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
		await createIteration(root, records, descriptor, 'demo', 'first', 'develop');
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
		const it = await createIteration(root, records, descriptor, 'demo', 'real change', 'develop', 'codebase');
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

		await createIteration(root, records, descriptor, 'demo', '', 'develop', 'codebase');
		expect(g('rev-parse', 'feature/demo').trim()).toBe(head);
		expect(readIterations(records, 'demo')[0]?.name).toBe('codebase');
	});

	it('refuses a second codebase record for the same project', async () => {
		await createIteration(root, records, descriptor, 'demo', '', 'develop', 'codebase');
		g('checkout', '-q', 'develop');
		await expect(createIteration(root, records, descriptor, 'demo', '', 'develop', 'codebase')).rejects.toThrow(
			/already has codebase work/,
		);
	});

	it('records nothing when a dirty tree stops the switch', async () => {
		writeFileSync(join(root, 'README.md'), 'uncommitted\n');
		await expect(createIteration(root, records, descriptor, 'demo', '', 'develop', 'codebase')).rejects.toThrow(/uncommitted/);
		expect(readIterations(records, 'demo')).toEqual([]);
	});

	it('does not skip a prototype number because a codebase entry exists', async () => {
		await createIteration(root, records, descriptor, 'demo', '', 'develop', 'codebase');
		g('checkout', '-q', 'develop');
		const proto = await createIteration(root, records, descriptor, 'demo', '', 'develop', 'prototype');
		expect(proto.name).toBe('i1');
		g('checkout', '-q', 'develop');
		expect((await createIteration(root, records, descriptor, 'demo', '', 'develop')).name).toBe('i2');
	});
});

describe('recordPreview', () => {
	it('saves the address on the named iteration and leaves the others alone', async () => {
		await createIteration(root, records, descriptor, 'demo', 'first', 'develop');
		g('checkout', '-q', 'develop');
		await createIteration(root, records, descriptor, 'demo', 'second', 'develop');
		const saved = recordPreview(records, 'demo', 'i1', 'https://dev-coke-pr-5.example.test');
		expect(saved.previewUrl).toBe('https://dev-coke-pr-5.example.test');
		const all = readIterations(records, 'demo');
		expect(all.find((i) => i.name === 'i1')?.previewUrl).toBe('https://dev-coke-pr-5.example.test');
		expect(all.find((i) => i.name === 'i2')?.previewUrl).toBeUndefined();
	});

	it('survives the record being refreshed when the iteration is opened again', async () => {
		await createIteration(root, records, descriptor, 'demo', 'first', 'develop');
		recordPreview(records, 'demo', 'i1', 'https://dev-coke-pr-5.example.test');
		await continueIteration(root, records, 'demo', 'i1');
		expect(readIterations(records, 'demo')[0]?.previewUrl).toBe('https://dev-coke-pr-5.example.test');
	});

	it('records the commit that was shared, so a comment can say what it was made against', async () => {
		await createIteration(root, records, descriptor, 'demo', 'first', 'develop');
		recordPreview(records, 'demo', 'i1', 'https://dev-coke-pr-5.example.test', 'abc123');
		expect(readIterations(records, 'demo')[0]).toMatchObject({ previewUrl: 'https://dev-coke-pr-5.example.test', commit: 'abc123' });
	});

	it('leaves the commit alone when none is given', async () => {
		await createIteration(root, records, descriptor, 'demo', 'first', 'develop');
		recordPreview(records, 'demo', 'i1', 'https://x.example.test');
		expect(readIterations(records, 'demo')[0]?.commit).toBeNull();
	});

	it('refuses an iteration that is not recorded rather than inventing one', () => {
		expect(() => recordPreview(records, 'demo', 'i9', 'https://x.example.test')).toThrow(IterationProblem);
	});
});

