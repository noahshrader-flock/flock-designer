import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CatalogReads } from '../src/main/services/componentCatalog';
import { DesignSystemsMemory, defaultBranch, designSystemId, filesOf, findDesignSystems, nameOf, within } from '../src/main/services/designSystems';
import type { ConnectedDesignSystem } from '../src/shared/contract';

/**
 * Connecting any repository (P4 of the design system plan): what a design system is (stories or tokens), where it is in a
 * monorepo, what it is called, its default branch, and the ones connected, remembered.
 */

const reads = (files: Record<string, string>): CatalogReads => ({
	listFiles: async (dir) => Object.keys(files).filter((f) => dir === '' || f.startsWith(`${dir}/`)),
	readFile: async (path) => {
		const text = files[path];
		if (text === undefined) throw new Error(`no ${path}`);
		return text;
	},
});
const story = (title: string) => `export default { title: '${title}' };\n`;
const tones = "export const blue = {\n  50: '#0000FF',\n};\n";

describe('finding the design systems in a repository', () => {
	it('finds one at the root of a repository of one, with its components and tokens counted', async () => {
		const repo = {
			'package.json': '{ "name": "@acme/ui" }',
			'src/Button.stories.tsx': story('Buttons/Button'),
			'src/Card.stories.tsx': story('Cards/Card'),
			'src/colors/tones.ts': tones,
		};
		expect(await findDesignSystems(reads(repo), 'acme/ui')).toEqual([{ folder: '', components: 2, tokens: 1, name: 'ui' }]);
	});

	it('finds the package that has them in a monorepo, and not the app beside it', async () => {
		const repo = {
			'package.json': '{ "name": "acme" }',
			'apps/web/package.json': '{ "name": "web" }',
			'apps/web/src/main.tsx': 'export {};\n',
			'packages/ui/package.json': '{ "name": "@acme/design" }',
			'packages/ui/src/Button.stories.tsx': story('Buttons/Button'),
			'packages/ui/src/theme/tones.ts': tones,
		};
		expect(await findDesignSystems(reads(repo), 'acme/acme')).toEqual([{ folder: 'packages/ui', components: 1, tokens: 1, name: 'design' }]);
	});

	it('finds each package that has its own, so the person can choose', async () => {
		const repo = {
			'package.json': '{ "name": "acme" }',
			'packages/ui/package.json': '{ "name": "ui" }',
			'packages/ui/Button.stories.tsx': story('Buttons/Button'),
			'packages/brand/package.json': '{ "name": "brand" }',
			'packages/brand/styles.css': ':root {\n  --primary: #ff0000;\n}\n',
		};
		expect((await findDesignSystems(reads(repo), 'acme/acme')).map((f) => [f.folder, f.components, f.tokens])).toEqual([
			['packages/brand', 0, 1],
			['packages/ui', 1, 0],
		]);
	});

	it('takes one with stories only, or tokens only, and finds none where there is neither', async () => {
		expect(await findDesignSystems(reads({ 'a.stories.tsx': story('A/A') }), 'x/a')).toHaveLength(1);
		expect(await findDesignSystems(reads({ 'styles.css': ':root { --primary: #ff0000; }\n' }), 'x/b')).toHaveLength(1);
		expect(await findDesignSystems(reads({ 'package.json': '{}', 'src/index.ts': 'export {};\n' }), 'x/c')).toEqual([]);
	});
});

describe('one package of a repository', () => {
	it('is its own files, not those of a package inside it', () => {
		const files = ['package.json', 'src/a.ts', 'packages/ui/package.json', 'packages/ui/b.ts'];
		expect(filesOf(files, '')).toEqual(['package.json', 'src/a.ts']);
		expect(filesOf(files, 'packages/ui')).toEqual(['packages/ui/package.json', 'packages/ui/b.ts']);
	});

	it('is read as if it were the repository', async () => {
		const scoped = within(reads({ 'a.ts': 'a', 'packages/ui/b.ts': 'b' }), ['packages/ui/b.ts']);
		expect(await scoped.listFiles('')).toEqual(['packages/ui/b.ts']);
		expect(await scoped.readFile('packages/ui/b.ts')).toBe('b');
	});
});

describe('what a design system is called', () => {
	it('is its Storybook’s brand title, its package’s name, or the repository’s, in that order', async () => {
		const withBrand = { '.storybook/theme.ts': "create({ brandTitle: 'Flock React Component Lib' })", 'package.json': '{ "name": "@flocksafety/flock-react-component-lib" }' };
		expect(await nameOf(reads(withBrand), Object.keys(withBrand), 'flocksafety/flock-react-component-lib', '')).toBe('Flock React Component Lib');
		expect(await nameOf(reads({ 'package.json': '{ "name": "@acme/ui" }' }), ['package.json'], 'acme/ui-kit', '')).toBe('ui');
		expect(await nameOf(reads({}), [], 'acme/ui-kit', '')).toBe('ui-kit');
	});

	it('in a monorepo, is the package’s own Storybook brand first, then the repository’s', async () => {
		const files = { '.storybook/manager.ts': "brandTitle: 'Acme'", 'packages/ui/package.json': '{ "name": "ui" }' };
		expect(await nameOf(reads(files), Object.keys(files), 'acme/acme', 'packages/ui')).toBe('Acme');
	});
});

describe('the branch read', () => {
	let dir: string;
	const g = (cwd: string, ...args: string[]) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' });
	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'dsnr-branch-'));
	});
	afterEach(() => rmSync(dir, { recursive: true, force: true }));

	it('is the repository’s default, as its clone records it', async () => {
		const remote = join(dir, 'remote.git');
		const work = join(dir, 'work');
		g(dir, 'init', '-q', '--bare', '-b', 'develop', remote);
		g(dir, 'clone', '-q', remote, work);
		writeFileSync(join(work, 'a'), 'a');
		g(work, 'add', '.');
		g(work, '-c', 'user.name=T', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'a');
		g(work, 'push', '-q', 'origin', 'develop');
		const clone = join(dir, 'clone');
		g(dir, 'clone', '-q', remote, clone);
		expect(await defaultBranch(clone)).toBe('develop');
	});

	it('is asked of the remote when the clone does not record it', async () => {
		const remote = join(dir, 'remote.git');
		g(dir, 'init', '-q', '--bare', '-b', 'main', remote);
		const work = join(dir, 'work');
		g(dir, 'clone', '-q', remote, work);
		writeFileSync(join(work, 'a'), 'a');
		g(work, 'add', '.');
		g(work, '-c', 'user.name=T', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'a');
		g(work, 'push', '-q', 'origin', 'main');
		g(work, 'remote', 'set-head', 'origin', '--delete');
		expect(await defaultBranch(work)).toBe('main');
	});
});

describe('the ones connected', () => {
	let dir: string;
	let file: string;
	const system = (repository: string, folder = ''): ConnectedDesignSystem => ({ id: designSystemId(repository, folder), name: repository, repository, root: join(dir, repository), folder, branch: 'main' });
	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'dsnr-systems-'));
		file = join(dir, 'design-system.json');
	});
	afterEach(() => rmSync(dir, { recursive: true, force: true }));

	it('are remembered, the last connected shown', () => {
		const memory = new DesignSystemsMemory(file);
		memory.add(system('acme/ui'));
		memory.add(system('acme/acme', 'packages/ui'));
		expect(memory.read().systems.map((s) => s.id)).toEqual(['acme/ui', 'acme/acme:packages/ui']);
		expect(memory.current()?.id).toBe('acme/acme:packages/ui');
		expect(new DesignSystemsMemory(file).current()?.id).toBe('acme/acme:packages/ui');
	});

	it('switch, and a removed one leaves the list, the next shown, and none when it was the last', () => {
		const memory = new DesignSystemsMemory(file);
		memory.add(system('acme/ui'));
		memory.add(system('acme/brand'));
		memory.select('acme/ui');
		expect(memory.current()?.id).toBe('acme/ui');
		memory.select('not/connected');
		expect(memory.current()?.id).toBe('acme/ui');
		memory.remove('acme/ui');
		expect(memory.read()).toMatchObject({ systems: [{ id: 'acme/brand' }], current: 'acme/brand' });
		memory.remove('acme/brand');
		expect(memory.read()).toEqual({ systems: [], current: null });
	});

	it('reads what an earlier version kept, one connected folder, as that design system: FUI, which it took alone, on develop', () => {
		const clone = join(dir, 'fui');
		mkdirSync(clone);
		execFileSync('git', ['-C', clone, 'init', '-q']);
		execFileSync('git', ['-C', clone, 'remote', 'add', 'origin', 'git@github.com:flocksafety/flock-react-component-lib.git']);
		writeFileSync(file, JSON.stringify({ folder: clone }));
		expect(new DesignSystemsMemory(file).read()).toEqual({
			systems: [{ id: 'flocksafety/flock-react-component-lib', name: 'flock-react-component-lib', repository: 'flocksafety/flock-react-component-lib', root: clone, folder: '', branch: 'develop' }],
			current: 'flocksafety/flock-react-component-lib',
		});
	});

	it('read nothing from a file that is not theirs, and keep nothing that is not a design system', () => {
		writeFileSync(file, '{ not json');
		expect(new DesignSystemsMemory(file).read()).toEqual({ systems: [], current: null });
		writeFileSync(file, JSON.stringify({ systems: [{ id: 'x' }, system('acme/ui')], current: 'x' }));
		expect(new DesignSystemsMemory(file).read()).toMatchObject({ systems: [{ id: 'acme/ui' }], current: 'acme/ui' });
		expect(readFileSync(file, 'utf8')).toContain('"x"');
	});
});
