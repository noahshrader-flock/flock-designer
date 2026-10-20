import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Catalog, CatalogUpdate, ConnectedDesignSystem } from '../src/shared/contract';
import { undeclared } from '../src/shared/wcag';
import { DesignLibrary, inLibrary, libraryReads, readLibrary, updateLibrary } from '../src/core/services/designSystem/designLibrary';
import { fetchProblem } from '../src/core/services/platform/fetch';
import { DesignSystemsMemory } from '../src/core/services/designSystem/designSystems';
import { g, writeFiles } from './fixtures';

const LIBRARY = 'flocksafety/flock-react-component-lib';
const GITHUB_URL = `https://github.com/${LIBRARY}.git`;
const at = (root: string, more: Partial<ConnectedDesignSystem> = {}): ConnectedDesignSystem => ({
	id: LIBRARY,
	name: 'FUI',
	repository: LIBRARY,
	root,
	folder: '',
	branch: 'develop',
	...more,
});
const story = (title: string) => `const meta = {\n  title: '${title}',\n};\nexport default meta;\n`;

let home: string;
/** Stands in for GitHub: the library's clone fetches from here, through git's own transport. */
let remote: string;
let upstream: string;
/** The person's clone. Its origin says GitHub; git is told to reach it here. */
let clone: string;

const commit = (root: string, message: string) => {
	g(root, 'add', '-A');
	g(root, 'commit', '-q', '-m', message);
};
const pushDevelop = (files: Record<string, string>, message = 'change') => {
	writeFiles(upstream, files);
	commit(upstream, message);
	g(upstream, 'push', '-q', 'origin', 'develop');
};
const ready = (c: Catalog) => {
	if (c.state !== 'ready') throw new Error(`not ready: ${c.state}`);
	return c;
};

beforeEach(() => {
	home = mkdtempSync(join(tmpdir(), 'fdw-library-'));
	remote = join(home, 'remote.git');
	upstream = join(home, 'upstream');
	clone = join(home, 'GitHub', 'flock-react-component-lib');
	g(home, 'init', '-q', '--bare', '-b', 'develop', remote);
	g(home, 'init', '-q', '-b', 'develop', upstream);
	g(upstream, 'remote', 'add', 'origin', remote);
	pushDevelop({ 'src/components/FSButton/FSButton.stories.tsx': story('Buttons/FSButton') }, 'first');
	g(home, 'clone', '-q', remote, clone);
	g(clone, 'remote', 'set-url', 'origin', GITHUB_URL);
	g(clone, 'config', `url.${remote}.insteadOf`, GITHUB_URL);
});

afterEach(() => rmSync(home, { recursive: true, force: true }));

describe('reading develop', () => {
	it('reads origin/develop, with its commit and date', async () => {
		const c = ready(await readLibrary(at(clone), 'unchanged'));
		expect(c.components.map((x) => x.id)).toEqual(['src/components/FSButton/FSButton.stories.tsx']);
		expect(c.branch).toBe('develop');
		expect(c.commit).toBe(g(remote, 'rev-parse', 'develop').trim());
		expect(Number.isNaN(Date.parse(c.committedAt))).toBe(false);
	});

	it('reads develop whatever the clone has checked out, and leaves the branch, the files and HEAD exactly as they were', async () => {
		g(clone, 'checkout', '-q', '-b', 'noah/work');
		writeFiles(clone, {
			'src/components/FSButton/FSButton.stories.tsx': story('Changed/FSButton'),
			'src/components/FSNew/FSNew.stories.tsx': story('Inputs/FSNew'),
		});
		commit(clone, 'work in progress');
		writeFiles(clone, { 'src/components/FSButton/FSButton.stories.tsx': story('Unsaved/FSButton') });
		const before = {
			head: g(clone, 'rev-parse', 'HEAD'),
			branch: g(clone, 'branch', '--show-current'),
			status: g(clone, 'status', '--porcelain'),
			refs: g(clone, 'for-each-ref'),
		};
		const unsaved = readFileSync(join(clone, 'src/components/FSButton/FSButton.stories.tsx'), 'utf8');

		const c = ready(await readLibrary(at(clone), 'unchanged'));
		expect(c.components.map((x) => [x.name, x.group])).toEqual([['FSButton', 'Buttons']]);
		await updateLibrary(clone, 'develop');

		expect({
			head: g(clone, 'rev-parse', 'HEAD'),
			branch: g(clone, 'branch', '--show-current'),
			status: g(clone, 'status', '--porcelain'),
			refs: g(clone, 'for-each-ref'),
		}).toEqual(before);
		expect(readFileSync(join(clone, 'src/components/FSButton/FSButton.stories.tsx'), 'utf8')).toBe(unsaved);
	});

	describe('its tokens (T2)', () => {
		const TOKEN_FILES = {
			'src/colors/tones/index.ts': "export { pineGreen } from './pineGreen';\n",
			'src/colors/tones/pineGreen.ts': "export const pineGreen = {\n  50: '#108062',\n};\n",
			'src/colors/theme/light.ts':
				"export const lightPalette = {\n  mode: 'light' as PaletteMode,\n  primary: {\n    main: pineGreen[50],\n  },\n};\n",
			'src/uxDocs/designTokens/PaletteColors.stories.tsx': story('Design Tokens/Color Palette'),
			'src/uxDocs/designTokens/PrimitiveColors.stories.tsx': story('Design Tokens/Color Primitives'),
		};

		it('are read beside the components, from the same commit', async () => {
			pushDevelop(TOKEN_FILES);
			await updateLibrary(clone, 'develop');
			const c = ready(await readLibrary(at(clone), 'unchanged'));
			expect(c.tokens.source).toBe('theme files');
			expect(c.tokens.tokens.find((t) => t.path === 'palette.light.primary.main')?.value).toBe('#108062');
		});

		it('take the library’s token pages out of the components list, as the panel shows them instead (decision 22)', async () => {
			pushDevelop(TOKEN_FILES);
			await updateLibrary(clone, 'develop');
			const c = ready(await readLibrary(at(clone), 'unchanged'));
			expect(c.components.map((x) => x.group)).not.toContain('Design Tokens');
			expect(c.components.map((x) => x.name)).toContain('FSButton');
		});

		it('take out a token group however the library names it', async () => {
			pushDevelop({ ...TOKEN_FILES, 'src/docs/Tokens.stories.tsx': story('Tokens/Spacing') });
			await updateLibrary(clone, 'develop');
			expect(ready(await readLibrary(at(clone), 'unchanged')).components.map((x) => x.group)).not.toContain('Tokens');
		});

		it('leave those pages in the list when no tokens were found, so the tokens are never in neither place', async () => {
			pushDevelop({ 'src/uxDocs/designTokens/PaletteColors.stories.tsx': story('Design Tokens/Color Palette') });
			await updateLibrary(clone, 'develop');
			const c = ready(await readLibrary(at(clone), 'unchanged'));
			expect(c.tokens.source).toBeNull();
			expect(c.components.map((x) => x.name)).toContain('Color Palette');
		});
	});

	it('reads only the design system’s own package in a monorepo, not an app beside it', async () => {
		pushDevelop({
			'package.json': '{}',
			'packages/ui/package.json': '{}',
			'packages/ui/Card.stories.tsx': story('Cards/Card'),
			'apps/web/package.json': '{}',
			'apps/web/Page.stories.tsx': story('Pages/Page'),
		});
		await updateLibrary(clone, 'develop');
		expect(ready(await readLibrary(at(clone, { folder: 'packages/ui' }), 'unchanged')).components.map((x) => x.name)).toEqual(['Card']);
	});

	it('reads develop from GitHub, not a local develop that is behind or ahead of it', async () => {
		writeFiles(clone, { 'src/components/FSLocal/FSLocal.stories.tsx': story('Inputs/FSLocal') });
		commit(clone, 'local only, on develop');
		expect(ready(await readLibrary(at(clone), 'unchanged')).components.map((x) => x.name)).toEqual(['FSButton']);
	});

	it('says there is no develop, and reads no other branch instead', async () => {
		g(clone, 'update-ref', '-d', 'refs/remotes/origin/develop');
		expect(await readLibrary(at(clone), 'unchanged')).toEqual({ state: 'no-branch', root: clone, branch: 'develop' });
	});

	it('reads every story in a folder, many at once, the same as reading each', async () => {
		const many = Object.fromEntries(
			Array.from({ length: 30 }, (_, i) => [`src/components/FSItem${i}/FSItem${i}.stories.tsx`, story(`Data Display/FSItem${i}`)]),
		);
		pushDevelop({
			...many,
			'src/compositeComponents/FSPopovers/a.stories.tsx': story('Popovers/A’s “quoted”'),
			'src/compositeComponents/FSPopovers/b.stories.tsx': story('Popovers/B'),
		});
		await updateLibrary(clone, 'develop');
		const c = ready(await readLibrary(at(clone), 'unchanged'));
		// Each story file is a component, as Storybook lists them: the two in one folder are two.
		expect(c.components).toHaveLength(33);
		expect(c.components.every((x) => x.group !== 'Ungrouped')).toBe(true);
		expect(c.components.filter((x) => x.group === 'Popovers').map((x) => x.name)).toEqual(['A’s “quoted”', 'B']);
	});
});

describe('bringing develop up to date', () => {
	it('fetches new commits on develop, and the list and the header change', async () => {
		const before = ready(await readLibrary(at(clone), 'unchanged'));
		pushDevelop({ 'src/components/FSChip/FSChip.stories.tsx': story('Data Display/FSChip') });
		expect(await updateLibrary(clone, 'develop')).toBe('updated');
		const after = ready(await readLibrary(at(clone), 'updated'));
		expect(after.components.map((x) => x.name)).toEqual(['FSButton', 'FSChip']);
		expect(after.commit).not.toBe(before.commit);
	});

	it('says unchanged when there was nothing new', async () => {
		expect(await updateLibrary(clone, 'develop')).toBe('unchanged');
	});

	it('moves no other ref: a branch on GitHub is not fetched', async () => {
		g(upstream, 'checkout', '-q', '-b', 'other');
		writeFiles(upstream, { 'x.txt': 'x' });
		commit(upstream, 'other');
		g(upstream, 'push', '-q', 'origin', 'other');
		await updateLibrary(clone, 'develop');
		expect(g(clone, 'for-each-ref', '--format=%(refname)', 'refs/remotes/origin/other')).toBe('');
	});

	it('says why when it cannot fetch, and the list it has is still read', async () => {
		g(clone, 'config', `url.${join(home, 'gone.git')}.insteadOf`, GITHUB_URL);
		g(clone, 'config', '--unset', `url.${remote}.insteadOf`);
		const outcome = await updateLibrary(clone, 'develop');
		expect(outcome).toEqual({ failed: expect.stringMatching(/^(Git could not update the library|GitHub would not let)/) });
		expect(ready(await readLibrary(at(clone), outcome)).components.map((x) => x.name)).toEqual(['FSButton']);
	});

	it.each([
		['fatal: could not read Username for https://github.com: terminal prompts disabled', /gh auth setup-git/],
		['remote: Repository not found.\nfatal: repository ... not found', /gh auth setup-git/],
		['git@github.com: Permission denied (publickey).', /gh auth setup-git/],
		['fatal: unable to access ...: Could not resolve host: github.com', /internet connection/],
		["fatal: couldn't find remote ref refs/heads/develop", /GitHub has no develop branch/],
		['fatal: something else', /Git could not update the library: something else/],
	])('says %s in words', (stderr, words) => {
		expect(fetchProblem(stderr, 'develop', 'the library')).toMatch(words);
	});
});

describe('what the tab is told', () => {
	const catalogOf = (update: CatalogUpdate): Catalog => ({
		state: 'ready',
		branch: 'develop',
		commit: 'c',
		showing: null,
		committedAt: 'd',
		update,
		components: [],
		tokens: { source: null, tokens: [], problems: [], looked: [] },
		accessibility: undeclared('none here'),
	});

	const memory = (system: ConnectedDesignSystem | null) => {
		const m = new DesignSystemsMemory(join(home, 'design-system.json'));
		if (system) m.add(system);
		return m;
	};

	it('says none is connected, or that the one shown is gone from this computer', async () => {
		expect(await new DesignLibrary({ systems: memory(null) }).catalog(false)).toEqual({ state: 'none' });
		expect(await new DesignLibrary({ systems: memory(at(join(home, 'gone'))) }).catalog(false)).toEqual({
			state: 'lost',
			name: 'FUI',
			root: join(home, 'gone'),
		});
	});

	it('tries the fetch again after one that failed outright, rather than handing back that failure for good', async () => {
		let fetches = 0;
		const library = new DesignLibrary({
			systems: memory(at(clone)),
			update: async () => {
				fetches++;
				if (fetches === 1) throw new Error('git is not here');
				return 'updated';
			},
			read: async (_, update) => catalogOf(update),
		});
		await expect(library.catalog(true)).rejects.toThrow('git is not here');
		expect(await library.catalog(true)).toMatchObject({ update: 'updated' });
		expect(fetches).toBe(2);
	});

	it('answers at once with what the clone has, then the next ask with refresh waits for the one fetch it started', async () => {
		let finish: (o: 'updated') => void = () => undefined;
		let fetches = 0;
		const library = new DesignLibrary({
			systems: memory(at(clone)),
			update: () => {
				fetches++;
				return new Promise((r) => (finish = r));
			},
			read: async (_, update) => catalogOf(update),
		});
		expect(await library.catalog(false)).toMatchObject({ update: 'updating' });
		const refreshed = library.catalog(true);
		finish('updated');
		expect(await refreshed).toMatchObject({ update: 'updated' });
		expect(fetches).toBe(1);
		// A later ask without refresh says how the last fetch went, and starts none.
		expect(await library.catalog(false)).toMatchObject({ update: 'updated' });
		expect(fetches).toBe(1);
		const again = library.catalog(true);
		finish('updated');
		await again;
		expect(fetches).toBe(2);
	});

	it('end to end: a new component on GitHub appears after the refresh', async () => {
		const library = new DesignLibrary({ systems: memory(at(clone)) });
		pushDevelop({ 'src/components/FSChip/FSChip.stories.tsx': story('Data Display/FSChip') });
		expect(ready(await library.catalog(false)).components.map((x) => x.name)).toEqual(['FSButton']);
		const refreshed = ready(await library.catalog(true));
		expect(refreshed.update).toBe('updated');
		expect(refreshed.components.map((x) => x.name)).toEqual(['FSButton', 'FSChip']);
	});
});

describe('reading the library’s files exactly', () => {
	it('gives every file as committed, with the white space at its ends, alone or as the last of a batch of stories', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'dsnr-exact-'));
		try {
			g(dir, 'init', '-q', '-b', 'develop');
			const files = {
				'src/a.stories.tsx': 'export const A = 1;\n\n',
				'src/b.stories.tsx': '\n  export const B = 2;\n\n',
				'src/theme.ts': 'export const t = 1;\n',
			};
			for (const [path, text] of Object.entries(files)) {
				mkdirSync(dirname(join(dir, path)), { recursive: true });
				writeFileSync(join(dir, path), text);
			}
			g(dir, 'add', '-A');
			g(dir, 'commit', '-q', '-m', 'files');
			const reads = libraryReads(dir, 'develop');
			// Listing reads every story in one batch; the theme file is read on its own.
			await reads.listFiles('');
			for (const [path, text] of Object.entries(files)) expect(await reads.readFile(path)).toBe(text);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe('a path read in the library', () => {
	it('is any in the repository, and none that leaves it, however it is written', () => {
		expect(inLibrary('node_modules/kit/./dist/../theme.css')).toBe('node_modules/kit/theme.css');
		expect(inLibrary('src\\theme.css')).toBe('src/theme.css');
		for (const away of ['node_modules/kit/../../../etc/passwd', '../outside.css', '/etc/passwd', '..'])
			expect(() => inLibrary(away)).toThrow("is not in the design system's repository");
	});
});
