import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findContext } from '../src/core/services/projects/findContext';
import { chooseDesignSystem } from '../src/core/services/projects/productDesignSystem';
import { makeProductFiles } from './fixtures';

/**
 * The design system is found in order: the folder the person chose for the product, then what the product says, then any
 * open folder that holds one.
 */

let base: string;
beforeEach(() => {
	base = mkdtempSync(join(tmpdir(), 'fdw-context-'));
});
afterEach(() => rmSync(base, { recursive: true, force: true }));

const product = (dir: string, pkg: string, folder?: string) => {
	mkdirSync(dir, { recursive: true });
	makeProductFiles(dir);
	const file = join(dir, '.dsnr', 'workspace.json');
	const descriptor = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
	writeFileSync(file, JSON.stringify({ ...descriptor, designSystem: folder ? { package: pkg, folder } : { package: pkg } }));
	return dir;
};
const designSystem = (dir: string, name = '@acme/ui') => {
	mkdirSync(join(dir, 'src'), { recursive: true });
	writeFileSync(join(dir, 'package.json'), JSON.stringify({ name }));
	writeFileSync(join(dir, 'src', 'Button.stories.tsx'), "export default { title: 'Inputs/Button' };\n");
	return dir;
};
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
			designSystem: { root: at('GitHub', 'ui'), how: 'beside' },
			designRepository: at('GitHub', 'flock-designer', 'projects'),
			productRepository: null,
			source: { state: 'usable', root: at('GitHub', 'ui'), how: 'beside' },
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
		expect((await findContext({ folders: [mono] })).designSystem).toEqual({ root: at('mono', 'packages', 'ui'), how: 'repository' });
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

	it('uses the folder chosen for the product over everything, and shows nothing in place of one gone, saying so', async () => {
		const coke = product(at('work', 'coke'), '@acme/ui');
		execFileSync('git', ['init', '-q', coke]);
		designSystem(at('work', 'ui'));
		const open = designSystem(at('open', 'ui'));
		const chosen = designSystem(at('far', 'away', 'ui'));
		await chooseDesignSystem(coke, chosen);
		expect((await findContext({ folders: [coke, open] })).designSystem).toEqual({ root: chosen, how: 'chosen' });
		rmSync(chosen, { recursive: true });
		const gone = await findContext({ folders: [coke, open] });
		expect(gone.designSystem).toBeNull();
		expect(gone.missing[0]).toBe(
			`${chosen}, the design system chosen for coke, is not on this computer any more. Choose another, or use the product's.`,
		);
	});

	it('prefers what the product names, then what is open', async () => {
		const coke = product(at('GitHub', 'coke'), '@acme/ui');
		designSystem(at('GitHub', 'ui'));
		const open = designSystem(at('open', 'ui'));
		expect((await findContext({ folders: [coke, open] })).designSystem?.how).toBe('beside');
		rmSync(at('GitHub', 'ui'), { recursive: true });
		expect((await findContext({ folders: [coke, open] })).designSystem?.how).toBe('open');
	});

	it('says each thing it could not find, and finds nothing in nothing', async () => {
		expect(await findContext({ folders: [] })).toEqual({
			product: null,
			designSystem: null,
			designRepository: null,
			productRepository: null,
			source: null,
			missing: [
				expect.stringMatching(/^No product is open/),
				expect.stringMatching(/^No design system/),
				// No product, so no design repository to name: the first line says what to open.
			],
		});
	});
});
