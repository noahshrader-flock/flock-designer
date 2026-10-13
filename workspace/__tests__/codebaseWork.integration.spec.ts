import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { codebaseWork } from '../src/main/services/codebaseWork';
import { readDescriptor } from '../src/main/services/descriptor';
import { g, makeProduct } from './fixtures';

let dir: string;
let product: string;
beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'fdw-codebase-work-'));
	product = join(dir, 'product');
	makeProduct(product);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const here = () => ({ canonical: product, descriptor: readDescriptor(product), recordsRoot: join(dir, 'flock-designer', 'projects') });
const work = (agentHere = false) => codebaseWork({ agentIn: () => agentHere, records: async () => [], login: () => null, written: (i) => i });

describe("a project's codebase work", () => {
	it('is not started while neither its branch nor a record says so', async () => {
		expect(await work().of(here(), 'demo')).toMatchObject({ branch: 'feature/demo', exists: false, recorded: false, started: false });
	});

	it('is never started or picked up under a running agent', async () => {
		await expect(work(true).start(here(), 'demo', 'note')).rejects.toThrow(/The agent is working in product/);
		await expect(work(true).resume(here(), 'demo', 'feature/demo')).rejects.toThrow(/The agent is working in product/);
	});

	it('starts only from a branch, and only one with the DSNR setup', async () => {
		g(product, 'checkout', '-q', '--detach');
		await expect(work().start(here(), 'demo', 'note')).rejects.toThrow(/detached HEAD/);
		g(product, 'checkout', '-q', '-b', 'bare', 'develop');
		g(product, 'rm', '-q', '-r', '.dsnr');
		g(product, 'commit', '-q', '-m', 'no setup');
		g(product, 'checkout', '-q', 'develop');
		await expect(work().start(here(), 'demo', 'note', 'bare')).rejects.toThrow('bare has no .dsnr/workspace.json, so work cannot start from it.');
	});
});
