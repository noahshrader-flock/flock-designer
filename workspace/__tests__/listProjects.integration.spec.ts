import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Project } from '../src/shared/contract';
import { listProjects } from '../src/main/services/listProjects';
import { makeProduct, projectIteration } from './fixtures';

let dir: string;
let product: string;
beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'fdw-list-projects-'));
	product = join(dir, 'product');
	makeProduct(product);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('the project list', () => {
	const fromGitHub: Project = { id: 'remote', title: 'Remote', folder: null, records: [], iterations: [], people: [] };
	const offline = () => Promise.reject(new Error('GitHub is out of reach.'));

	it("is GitHub's when there is no checkout, and GitHub's failure when it cannot be reached", async () => {
		expect((await listProjects({ root: null, login: null, remote: async () => [fromGitHub] })).map((p) => p.id)).toEqual(['remote']);
		await expect(listProjects({ root: null, login: null, remote: offline })).rejects.toThrow('GitHub is out of reach.');
	});

	it('never says codebase work is ready for engineering with no checkout, where it cannot be checked against the branch', async () => {
		const ready: Project = {
			...fromGitHub,
			iterations: [projectIteration({ name: 'codebase', branch: 'feature/remote', readyAt: 'a1b2c3d' })],
		};
		const [listed] = await listProjects({ root: null, login: null, remote: async () => [ready] });
		expect(listed?.iterations[0]?.readyAt).toBeNull();
	});

	it("still shows this machine's work when GitHub cannot be reached", async () => {
		const design = join(dir, 'flock-designer');
		mkdirSync(join(design, '.git'), { recursive: true });
		mkdirSync(join(design, 'projects', 'demo'), { recursive: true });
		writeFileSync(join(design, 'projects', 'demo', 'brief.md'), '# Demo\n');
		const record = { projectId: 'demo', name: 'v1-i1', branch: 'prototype/demo/v1-i1', commit: null, createdAt: '2026-10-01T00:00:00Z' };
		writeFileSync(join(design, 'projects', 'demo', 'iterations.json'), JSON.stringify([record]));
		const listed = await listProjects({ root: product, login: null, remote: offline });
		expect(listed.map((p) => [p.id, p.iterations.map((i) => i.name)])).toEqual([['demo', ['v1-i1']]]);
	});
});
