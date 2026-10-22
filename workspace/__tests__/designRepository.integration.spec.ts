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
} from '../src/core/services/products/discovery';
import { readDescriptor } from '../src/core/services/products/descriptor';
import { findContext } from '../src/core/services/products/findContext';
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
/** A clone of a design repository: a git repository with its agent guide and prototypes. */
const designRepository = (dir: string) => {
	mkdirSync(join(dir, '.git'), { recursive: true });
	mkdirSync(join(dir, 'agents'), { recursive: true });
	writeFileSync(join(dir, 'agents', 'ui-guide.md'), '# Building UI\n');
	mkdirSync(join(dir, 'prototypes'), { recursive: true });
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
		expect(recordsRootFor(product)).toBe(join(base, 'GitHub', DESIGN_REPO.repo, 'prototypes'));
	});

	it('is the one its workspace file names, found beside it by that repository’s name, never Flock’s', () => {
		productNaming('cheq/cheq-designer');
		expect(designRepositoryOf(product)).toEqual({ owner: 'cheq', repo: 'cheq-designer' });
		designRepository(join(base, 'GitHub', DESIGN_REPO.repo));
		expect(recordsRootFor(product)).toBeNull();
		designRepository(join(base, 'GitHub', 'cheq-designer'));
		expect(recordsRootFor(product)).toBe(join(base, 'GitHub', 'cheq-designer', 'prototypes'));
	});

	it('is the clone the person picked for it, kept on this machine, before one beside the product', () => {
		productNaming('cheq/cheq-designer');
		const clones = new DesignRepositoryClones(join(base, 'design-repositories.json'));
		designRepository(join(base, 'GitHub', 'cheq-designer'));
		const picked = designRepository(join(base, 'elsewhere', 'designer'));
		clones.set('cheq/cheq-designer', picked);
		// Kept: read again from the file, as the next window would.
		expect(new DesignRepositoryClones(join(base, 'design-repositories.json')).at('cheq/cheq-designer')).toBe(picked);
		expect(recordsRootFor(product, { clones })).toBe(join(picked, 'prototypes'));
		// Gone: the one beside the product, not nothing.
		rmSync(picked, { recursive: true, force: true });
		expect(recordsRootFor(product, { clones })).toBe(join(base, 'GitHub', 'cheq-designer', 'prototypes'));
	});

	it('says which repository is missing, and the two ways to give it, when neither is there', async () => {
		productNaming('cheq/cheq-designer');
		expect(recordsRootFor(product)).toBeNull();
		const said =
			'DSNR could not find cheq/cheq-designer, the design repository cheq-console belongs to. Clone it beside cheq-console, or run DSNR: Locate the design repository.';
		expect(designRepositoryMissing(product)).toBe(said);
		expect((await findContext({ folders: [product] })).missing).toContain(
			`${said} Until then its prototypes are read from GitHub when you are signed in.`,
		);
	});

	it('refuses a workspace file whose design repository is not owner/repo, and guesses no repository for it', () => {
		productNaming('../elsewhere');
		expect(() => readDescriptor(product)).toThrow('designRepository that is not owner/repo');
		// Unreadable: no repository is guessed for it, Flock's included, and the file's own error is what is said.
		designRepository(join(base, 'GitHub', DESIGN_REPO.repo));
		expect(recordsRootFor(product)).toBeNull();
		expect(designRepositoryMissing(product)).toMatch(
			/^Which design repository cheq-console belongs to cannot be told: .*designRepository that is not owner\/repo/,
		);
	});

	it('takes a picked folder only when it is a git repository with the agent guide, never a product with a prototypes folder', () => {
		expect(isDesignRepository(designRepository(join(base, 'a')))).toBe(true);
		// An Angular workspace keeps its apps in prototypes/: a product, not a design repository.
		mkdirSync(join(base, 'b', '.git'), { recursive: true });
		mkdirSync(join(base, 'b', 'prototypes'), { recursive: true });
		expect(isDesignRepository(join(base, 'b'))).toBe(false);
		// The guide alone, not a git repository.
		mkdirSync(join(base, 'c', 'agents'), { recursive: true });
		writeFileSync(join(base, 'c', 'agents', 'ui-guide.md'), '# Building UI\n');
		expect(isDesignRepository(join(base, 'c'))).toBe(false);
	});
});
