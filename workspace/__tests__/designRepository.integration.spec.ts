import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
	DesignRepositoryClones,
	designRepositoryMissing,
	designRepositoryOf,
	isDesignRepository,
	recordsRootFor,
} from '../src/core/services/projects/discovery';
import { readDescriptor } from '../src/core/services/projects/descriptor';
import { findContext } from '../src/core/services/projects/findContext';
import { DESIGN_REPO } from '../src/shared/config';
import { makeProductFiles } from './fixtures';

let base: string;
let product: string;

/** A product in `base/GitHub`, naming the design repository it belongs to, or none. */
const productNaming = (designRepository?: string) => {
	product = join(base, 'GitHub', 'cheq-console');
	mkdirSync(product, { recursive: true });
	makeProductFiles(product);
	if (designRepository !== undefined) {
		const file = join(product, '.dsnr', 'workspace.json');
		const descriptor = JSON.parse(readFileSync(file, 'utf8')) as object;
		writeFileSync(file, JSON.stringify({ ...descriptor, designRepository }));
	}
};
/** A clone of a design repository: a git repository with its agents and projects. */
const designRepository = (dir: string) => {
	mkdirSync(join(dir, '.git'), { recursive: true });
	mkdirSync(join(dir, 'agents'), { recursive: true });
	mkdirSync(join(dir, 'projects'), { recursive: true });
	return dir;
};

beforeEach(() => {
	base = mkdtempSync(join(tmpdir(), 'fdw-design-repo-'));
});
afterEach(() => rmSync(base, { recursive: true, force: true }));

describe('the design repository a product belongs to', () => {
	it('is Flock’s when the product names none, as every product’s was, beside it under its name', () => {
		productNaming();
		expect(designRepositoryOf(product)).toEqual(DESIGN_REPO);
		designRepository(join(base, 'GitHub', DESIGN_REPO.repo));
		expect(recordsRootFor(product)).toBe(join(base, 'GitHub', DESIGN_REPO.repo, 'projects'));
	});

	it('is the one its workspace file names, found beside it by that repository’s name, never Flock’s', () => {
		productNaming('cheq/cheq-designer');
		expect(designRepositoryOf(product)).toEqual({ owner: 'cheq', repo: 'cheq-designer' });
		designRepository(join(base, 'GitHub', DESIGN_REPO.repo));
		expect(recordsRootFor(product)).toBeNull();
		designRepository(join(base, 'GitHub', 'cheq-designer'));
		expect(recordsRootFor(product)).toBe(join(base, 'GitHub', 'cheq-designer', 'projects'));
	});

	it('is the clone the person picked for it, kept on this machine, before one beside the product', () => {
		productNaming('cheq/cheq-designer');
		const clones = new DesignRepositoryClones(join(base, 'design-repositories.json'));
		designRepository(join(base, 'GitHub', 'cheq-designer'));
		const picked = designRepository(join(base, 'elsewhere', 'designer'));
		clones.set('cheq/cheq-designer', picked);
		// Kept: read again from the file, as the next window would.
		expect(new DesignRepositoryClones(join(base, 'design-repositories.json')).at('cheq/cheq-designer')).toBe(picked);
		expect(recordsRootFor(product, { clones })).toBe(join(picked, 'projects'));
		// Gone: the one beside the product, not nothing.
		rmSync(picked, { recursive: true, force: true });
		expect(recordsRootFor(product, { clones })).toBe(join(base, 'GitHub', 'cheq-designer', 'projects'));
	});

	it('says which repository is missing, and the two ways to give it, when neither is there', async () => {
		productNaming('cheq/cheq-designer');
		expect(recordsRootFor(product)).toBeNull();
		const said =
			'DSNR could not find cheq/cheq-designer, the design repository cheq-console belongs to. Clone it beside cheq-console, or run DSNR: Locate the design repository.';
		expect(designRepositoryMissing(product)).toBe(said);
		expect((await findContext({ folders: [product] })).missing).toContain(
			`${said} Until then its projects are read from GitHub when you are signed in.`,
		);
	});

	it('refuses a workspace file whose design repository is not owner/repo', () => {
		productNaming('../elsewhere');
		expect(() => readDescriptor(product)).toThrow('designRepository that is not owner/repo');
		// Unreadable: Flock's, as with none, rather than a guess.
		expect(designRepositoryOf(product)).toEqual(DESIGN_REPO);
	});

	it('takes a picked folder only when it is a git repository with an agents or a projects folder', () => {
		expect(isDesignRepository(designRepository(join(base, 'a')))).toBe(true);
		mkdirSync(join(base, 'b', '.git'), { recursive: true });
		expect(isDesignRepository(join(base, 'b'))).toBe(false);
		mkdirSync(join(base, 'c', 'agents'), { recursive: true });
		expect(isDesignRepository(join(base, 'c'))).toBe(false);
	});
});
