import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findContext } from '../src/core/services/projects/findContext';
import { makeProductFiles } from './fixtures';

/**
 * What a shell works on, found from the folders open in it instead of chosen and cloned:
 * the product, its design system, and the design repository its projects are kept in. In order: what the product says,
 * then any open folder that holds a design system, then the one the person located; and for each, what is missing, said.
 */

let base: string;
beforeEach(() => {
	base = mkdtempSync(join(tmpdir(), 'fdw-context-'));
});
afterEach(() => rmSync(base, { recursive: true, force: true }));

/** A product repository at `dir`, its design system named as `pkg`, in `folder` of it when it is a monorepo. */
const product = (dir: string, pkg: string, folder?: string) => {
	mkdirSync(dir, { recursive: true });
	makeProductFiles(dir);
	const file = join(dir, '.dsnr', 'workspace.json');
	const descriptor = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
	writeFileSync(file, JSON.stringify({ ...descriptor, designSystem: folder ? { package: pkg, folder } : { package: pkg } }));
	return dir;
};
/** A design system at `dir`: a package with one story. */
const designSystem = (dir: string, name = '@acme/ui') => {
	mkdirSync(join(dir, 'src'), { recursive: true });
	writeFileSync(join(dir, 'package.json'), JSON.stringify({ name }));
	writeFileSync(join(dir, 'src', 'Button.stories.tsx'), "export default { title: 'Inputs/Button' };\n");
	return dir;
};
/** The design repository at `dir`: a checkout, with its projects. */
const designRepository = (dir: string) => {
	mkdirSync(join(dir, '.git'), { recursive: true });
	mkdirSync(join(dir, 'projects'), { recursive: true });
	return dir;
};
const at = (...p: string[]) => join(base, ...p);

describe('the context, from the open folders', () => {
	it('finds the design system the product names, checked out beside it, and the design repository beside that', async () => {
		const coke = product(at('GitHub', 'coke'), '@acme/ui');
		designSystem(at('GitHub', 'ui'));
		designRepository(at('GitHub', 'flock-designer'));
		expect(await findContext({ folders: [coke] })).toEqual({
			product: coke,
			designSystem: { root: at('GitHub', 'ui'), how: 'named' },
			designRepository: at('GitHub', 'flock-designer', 'projects'),
			// No remote: which repository it is is not known.
			productRepository: null,
			missing: [],
		});
	});

	it('says which repository the product is, from its remote, whatever its folder is called', async () => {
		const coke = product(at('GitHub', 'my-coke'), '@acme/ui');
		execFileSync('git', ['init', '-q', coke]);
		execFileSync('git', ['-C', coke, 'remote', 'add', 'origin', 'git@github.com:flocksafety/flock-coke.git']);
		expect((await findContext({ folders: [coke] })).productRepository).toBe('flocksafety/flock-coke');
		expect((await findContext({ folders: [] })).productRepository).toBeNull();
	});

	it('finds a design system that is a folder of the product, as its descriptor says (a monorepo)', async () => {
		const mono = product(at('mono'), '@acme/ui', 'packages/ui');
		designSystem(at('mono', 'packages', 'ui'));
		expect((await findContext({ folders: [mono] })).designSystem).toEqual({ root: at('mono', 'packages', 'ui'), how: 'named' });
	});

	it('finds the design system in another open folder when it is not where the product names it', async () => {
		const coke = product(at('work', 'coke'), '@acme/ui');
		const elsewhere = designSystem(at('elsewhere', 'design'));
		expect((await findContext({ folders: [coke, elsewhere] })).designSystem).toEqual({ root: elsewhere, how: 'open' });
	});

	it('works with the design system opened alone, and says there is no product', async () => {
		const ui = designSystem(at('ui'));
		const found = await findContext({ folders: [ui] });
		expect(found.product).toBeNull();
		expect(found.designSystem).toEqual({ root: ui, how: 'open' });
		expect(found.missing[0]).toMatch(/^No product is open/);
	});

	it('uses the folder the person located when nothing open holds one, and only if it does', async () => {
		const coke = product(at('work', 'coke'), '@acme/ui');
		const located = designSystem(at('far', 'away', 'ui'));
		expect((await findContext({ folders: [coke], located })).designSystem).toEqual({ root: located, how: 'located' });
		mkdirSync(at('empty'), { recursive: true });
		expect((await findContext({ folders: [coke], located: at('empty') })).designSystem).toBeNull();
	});

	it('prefers what the product names, then what is open, then what was located', async () => {
		const coke = product(at('GitHub', 'coke'), '@acme/ui');
		designSystem(at('GitHub', 'ui'));
		const open = designSystem(at('open', 'ui'));
		const located = designSystem(at('located', 'ui'));
		expect((await findContext({ folders: [coke, open], located })).designSystem?.how).toBe('named');
		rmSync(at('GitHub', 'ui'), { recursive: true });
		expect((await findContext({ folders: [coke, open], located })).designSystem?.how).toBe('open');
		expect((await findContext({ folders: [coke], located })).designSystem?.how).toBe('located');
	});

	it('says each thing it could not find, and finds nothing in nothing', async () => {
		expect(await findContext({ folders: [] })).toEqual({
			product: null,
			designSystem: null,
			designRepository: null,
			productRepository: null,
			missing: [
				expect.stringMatching(/^No product is open/),
				expect.stringMatching(/^No design system/),
				expect.stringMatching(/^The design repository/),
			],
		});
	});
});
