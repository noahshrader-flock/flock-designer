import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { codebaseWork } from '../src/core/services/codebase/codebaseWork';
import { readDescriptor } from '../src/core/services/projects/descriptor';
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
const work = () => codebaseWork({ records: async () => [], login: () => null, written: (i) => i });

describe("a project's codebase work", () => {
	it('is not started while neither its branch nor a record says so', async () => {
		expect(await work().of(here(), 'demo')).toMatchObject({ branch: 'feature/demo', exists: false, recorded: false, started: false });
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

	it('is not picked up from a branch without the DSNR setup, and the checkout is left where it was', async () => {
		g(product, 'checkout', '-q', '-b', 'feature/demo', 'develop');
		g(product, 'rm', '-q', '-r', '.dsnr');
		g(product, 'commit', '-q', '-m', 'made before the setup');
		g(product, 'checkout', '-q', 'develop');
		const at = here();
		expect(await work().of(at, 'demo')).toMatchObject({ exists: true, setup: false });
		await expect(work().resume(at, 'demo', 'feature/demo')).rejects.toThrow(
			'feature/demo has no .dsnr/workspace.json, so DSNR cannot work in it. Merge a branch that has the DSNR setup into it first.',
		);
		expect(g(product, 'branch', '--show-current').toString().trim()).toBe('develop');
	});

	it('is picked up from a branch that has it, which is also what a branch not made yet counts as', async () => {
		expect(await work().of(here(), 'demo')).toMatchObject({ exists: false, setup: true });
		g(product, 'branch', 'feature/demo', 'develop');
		expect(await work().of(here(), 'demo')).toMatchObject({ exists: true, setup: true });
	});
});
