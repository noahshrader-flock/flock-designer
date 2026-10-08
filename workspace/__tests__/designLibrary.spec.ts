import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Catalog } from '../src/shared/contract';
import { connectLibrary, DesignLibrary, fetchProblem, findLibrary, LIBRARY, locateLibrary, readLibrary, updateLibrary, whyNotLibrary } from '../src/main/services/designLibrary';
import { FolderMemory } from '../src/main/services/folderMemory';
import type { DiscoveryDeps } from '../src/main/services/discovery';
import { g } from './fixtures';

const GITHUB_URL = `https://github.com/${LIBRARY}.git`;
const story = (title: string) => `const meta = {\n  title: '${title}',\n};\nexport default meta;\n`;

let home: string;
/** Stands in for GitHub: the library's clone fetches from here, through git's own transport. */
let remote: string;
/** Where commits to `develop` are made before they are pushed to the remote. */
let upstream: string;
/** The person's clone. Its origin says GitHub; git is told to reach it here. */
let clone: string;

const write = (root: string, files: Record<string, string>) => {
	for (const [path, text] of Object.entries(files)) {
		mkdirSync(dirname(join(root, path)), { recursive: true });
		writeFileSync(join(root, path), text);
	}
};
const commit = (root: string, message: string) => {
	g(root, 'add', '-A');
	g(root, '-c', 'user.name=T', '-c', 'user.email=t@example.com', 'commit', '-q', '-m', message);
};
const pushDevelop = (files: Record<string, string>, message = 'change') => {
	write(upstream, files);
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

describe('finding the library', () => {
	const deps = (tree: Record<string, string | null>): DiscoveryDeps & { origin: (dir: string) => string | null } => ({
		home: '/h',
		exists: (p) => Object.keys(tree).some((dir) => p === `${dir}/.git`),
		list: (dir) => Object.keys(tree).filter((d) => d.startsWith(`${dir}/`) && !d.slice(dir.length + 1).includes('/')).map((d) => d.slice(dir.length + 1)),
		activity: () => 0,
		origin: (dir) => tree[dir] ?? null,
	});

	it.each([
		['https', 'https://github.com/flocksafety/flock-react-component-lib.git'],
		['https with a token', 'https://x-access-token:abc@github.com/flocksafety/flock-react-component-lib'],
		['ssh', 'git@github.com:flocksafety/flock-react-component-lib.git'],
		['ssh://', 'ssh://git@github.com/flocksafety/flock-react-component-lib'],
		['a different case', 'https://github.com/FlockSafety/Flock-React-Component-Lib.git'],
	])('finds a clone whose origin is the library, written as %s, under any folder name', (_, url) => {
		expect(findLibrary(deps({ '/h/GitHub/fui': url }))).toBe('/h/GitHub/fui');
	});

	it('does not take a clone of another repository, or a fork, or one with no origin', () => {
		expect(
			findLibrary(
				deps({
					'/h/GitHub/flock-coke': 'https://github.com/flocksafety/flock-coke.git',
					'/h/GitHub/flock-react-component-lib': 'https://github.com/someone/flock-react-component-lib.git',
					'/h/GitHub/loose': null,
				}),
			),
		).toBeNull();
	});

	it('looks in the clone folder first', () => {
		const tree = { '/elsewhere/fui': GITHUB_URL };
		expect(findLibrary(deps(tree))).toBeNull();
		expect(findLibrary({ ...deps(tree), folders: ['/elsewhere'] })).toBe('/elsewhere/fui');
	});

	it('reads the real .git/config of a clone', () => {
		expect(findLibrary({ home, exists: (p) => p === join(clone, '.git'), list: (d) => (d === join(home, 'GitHub') ? ['flock-react-component-lib'] : []), activity: () => 0 })).toBe(clone);
	});
});

describe('reading develop', () => {
	it('reads origin/develop, with its commit and date', async () => {
		const c = ready(await readLibrary(clone, 'unchanged'));
		expect(c.components.map((x) => x.id)).toEqual(['components/FSButton']);
		expect(c.commit).toBe(g(remote, 'rev-parse', 'develop').trim());
		expect(Number.isNaN(Date.parse(c.committedAt))).toBe(false);
	});

	it('reads develop whatever the clone has checked out, and leaves the branch, the files and HEAD exactly as they were', async () => {
		g(clone, 'checkout', '-q', '-b', 'noah/work');
		write(clone, { 'src/components/FSButton/FSButton.stories.tsx': story('Changed/FSButton'), 'src/components/FSNew/FSNew.stories.tsx': story('Inputs/FSNew') });
		commit(clone, 'work in progress');
		write(clone, { 'src/components/FSButton/FSButton.stories.tsx': story('Unsaved/FSButton') });
		const before = { head: g(clone, 'rev-parse', 'HEAD'), branch: g(clone, 'branch', '--show-current'), status: g(clone, 'status', '--porcelain'), refs: g(clone, 'for-each-ref') };
		const unsaved = readFileSync(join(clone, 'src/components/FSButton/FSButton.stories.tsx'), 'utf8');

		const c = ready(await readLibrary(clone, 'unchanged'));
		expect(c.components.map((x) => [x.name, x.group])).toEqual([['FSButton', 'Buttons']]);
		await updateLibrary(clone);

		expect({ head: g(clone, 'rev-parse', 'HEAD'), branch: g(clone, 'branch', '--show-current'), status: g(clone, 'status', '--porcelain'), refs: g(clone, 'for-each-ref') }).toEqual(before);
		expect(readFileSync(join(clone, 'src/components/FSButton/FSButton.stories.tsx'), 'utf8')).toBe(unsaved);
	});

	it('reads develop from GitHub, not a local develop that is behind or ahead of it', async () => {
		write(clone, { 'src/components/FSLocal/FSLocal.stories.tsx': story('Inputs/FSLocal') });
		commit(clone, 'local only, on develop');
		expect(ready(await readLibrary(clone, 'unchanged')).components.map((x) => x.name)).toEqual(['FSButton']);
	});

	it('says there is no develop, and reads no other branch instead', async () => {
		g(clone, 'update-ref', '-d', 'refs/remotes/origin/develop');
		expect(await readLibrary(clone, 'unchanged')).toEqual({ state: 'no-develop', root: clone });
	});

	it('reads every story in a folder, many at once, the same as reading each', async () => {
		const many = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`src/components/FSItem${i}/FSItem${i}.stories.tsx`, story(`Data Display/FSItem${i}`)]));
		pushDevelop({ ...many, 'src/compositeComponents/FSPopovers/a.stories.tsx': story('Popovers/A’s “quoted”'), 'src/compositeComponents/FSPopovers/b.stories.tsx': story('Popovers/B') });
		await updateLibrary(clone);
		const c = ready(await readLibrary(clone, 'unchanged'));
		expect(c.components).toHaveLength(32);
		expect(c.components.every((x) => x.stories.every((s) => s.title !== null))).toBe(true);
		expect(c.components.find((x) => x.name === 'FSPopovers')?.stories.map((s) => s.title)).toEqual(['Popovers/A’s “quoted”', 'Popovers/B']);
	});
});

describe('bringing develop up to date', () => {
	it('fetches new commits on develop, and the list and the header change', async () => {
		const before = ready(await readLibrary(clone, 'unchanged'));
		pushDevelop({ 'src/components/FSChip/FSChip.stories.tsx': story('Data Display/FSChip') });
		expect(await updateLibrary(clone)).toBe('updated');
		const after = ready(await readLibrary(clone, 'updated'));
		expect(after.components.map((x) => x.name)).toEqual(['FSButton', 'FSChip']);
		expect(after.commit).not.toBe(before.commit);
	});

	it('says unchanged when there was nothing new', async () => {
		expect(await updateLibrary(clone)).toBe('unchanged');
	});

	it('moves no other ref: a branch on GitHub is not fetched', async () => {
		g(upstream, 'checkout', '-q', '-b', 'other');
		write(upstream, { 'x.txt': 'x' });
		commit(upstream, 'other');
		g(upstream, 'push', '-q', 'origin', 'other');
		await updateLibrary(clone);
		expect(g(clone, 'for-each-ref', '--format=%(refname)', 'refs/remotes/origin/other')).toBe('');
	});

	it('says why when it cannot fetch, and the list it has is still read', async () => {
		g(clone, 'config', `url.${join(home, 'gone.git')}.insteadOf`, GITHUB_URL);
		g(clone, 'config', '--unset', `url.${remote}.insteadOf`);
		const outcome = await updateLibrary(clone);
		expect(outcome).toEqual({ failed: expect.stringMatching(/^(Git could not update the library|GitHub would not let)/) });
		expect(ready(await readLibrary(clone, outcome)).components.map((x) => x.name)).toEqual(['FSButton']);
	});

	it.each([
		['fatal: could not read Username for https://github.com: terminal prompts disabled', /gh auth setup-git/],
		['remote: Repository not found.\nfatal: repository ... not found', /gh auth setup-git/],
		['git@github.com: Permission denied (publickey).', /gh auth setup-git/],
		['fatal: unable to access ...: Could not resolve host: github.com', /internet connection/],
		["fatal: couldn't find remote ref refs/heads/develop", /no develop branch/],
		['fatal: something else', /Git could not update the library: something else/],
	])('says %s in words', (stderr, words) => {
		expect(fetchProblem(stderr)).toMatch(words);
	});
});

describe('what the tab is told', () => {
	const catalogOf = (update: string): Catalog => ({ state: 'ready', commit: 'c', committedAt: 'd', update: update as never, components: [] });

	it('says there is no clone, naming the library', async () => {
		expect(await new DesignLibrary({ find: () => ({ root: null, lost: '/gone' }) }).catalog(false)).toEqual({ state: 'no-clone', repository: LIBRARY, lost: '/gone' });
	});

	it('answers at once with what the clone has, then the next ask with refresh waits for the one fetch it started', async () => {
		let finish: (o: 'updated') => void = () => undefined;
		let fetches = 0;
		const library = new DesignLibrary({
			find: () => ({ root: clone, lost: null }),
			update: () => {
				fetches++;
				return new Promise((r) => (finish = r));
			},
			read: async (_, update) => catalogOf(update as string),
		});
		expect(await library.catalog(false)).toMatchObject({ update: 'updating' });
		const refreshed = library.catalog(true);
		finish('updated');
		expect(await refreshed).toMatchObject({ update: 'updated' });
		expect(fetches).toBe(1);
		// A later ask without refresh says how the last fetch went, and starts none.
		expect(await library.catalog(false)).toMatchObject({ update: 'updated' });
		expect(fetches).toBe(1);
		// Refresh again is a new fetch.
		const again = library.catalog(true);
		finish('updated');
		await again;
		expect(fetches).toBe(2);
	});

	it('end to end: a new component on GitHub appears after the refresh', async () => {
		const library = new DesignLibrary({ find: () => ({ root: clone, lost: null }) });
		pushDevelop({ 'src/components/FSChip/FSChip.stories.tsx': story('Data Display/FSChip') });
		expect(ready(await library.catalog(false)).components.map((x) => x.name)).toEqual(['FSButton']);
		const refreshed = ready(await library.catalog(true));
		expect(refreshed.update).toBe('updated');
		expect(refreshed.components.map((x) => x.name)).toEqual(['FSButton', 'FSChip']);
	});
});

describe('connecting the library', () => {
	const at = (tree: Record<string, string | null>) => ({
		origin: (dir: string) => tree[dir] ?? null,
		exists: (p: string) => Object.keys(tree).some((dir) => p === `${dir}/.git`),
	});
	const why = (dir: string, tree: Record<string, string | null>) => whyNotLibrary(dir, at(tree).origin, at(tree).exists);

	it('takes a clone whose origin is the library, in any form and case', () => {
		expect(why('/a', { '/a': 'git@github.com:FlockSafety/flock-react-component-lib.git' })).toBeNull();
		expect(why('/a', { '/a': 'https://github.com/flocksafety/flock-react-component-lib' })).toBeNull();
	});

	it('refuses, in words, a plain folder, a clone of nothing on GitHub, another repository and a fork', () => {
		expect(why('/plain', {})).toMatch(/is not a git repository/);
		expect(why('/a', { '/a': null })).toMatch(/is not a clone of a GitHub repository/);
		expect(why('/a', { '/a': 'https://github.com/flocksafety/flock-coke.git' })).toBe(`/a is a clone of flocksafety/flock-coke, not ${LIBRARY}.`);
		expect(why('/a', { '/a': 'https://github.com/someone/flock-react-component-lib.git' })).toMatch(/is a clone of someone\/flock-react-component-lib, not/);
	});

	const memory = (kept: string | null) => ({ read: () => kept, write: () => undefined }) as unknown as FolderMemory;
	const libraryAt = (good: string[]) => (dir: string) => (good.includes(dir) ? null : 'not it');

	it('uses the connected folder while it is the library, over one found by itself', () => {
		expect(locateLibrary(memory('/connected'), () => '/found', libraryAt(['/connected', '/found']))).toEqual({ root: '/connected', lost: null });
	});

	it('finds one by itself when nothing is connected, or the connected one is gone, and says what was lost only when none is found', () => {
		expect(locateLibrary(memory(null), () => '/found', libraryAt(['/found']))).toEqual({ root: '/found', lost: null });
		expect(locateLibrary(memory('/moved'), () => '/found', libraryAt(['/found']))).toEqual({ root: '/found', lost: null });
		expect(locateLibrary(memory('/moved'), () => null, libraryAt([]))).toEqual({ root: null, lost: '/moved' });
		expect(locateLibrary(memory(null), () => null, libraryAt([]))).toEqual({ root: null, lost: null });
	});

	it('connects a real clone of the library and remembers it, and the remembered one is read back', async () => {
		const kept = new FolderMemory(join(home, 'settings', 'design-system.json'), 'folder');
		await connectLibrary(clone, kept);
		expect(kept.read()).toBe(clone);
		expect(locateLibrary(kept, () => null)).toEqual({ root: clone, lost: null });
	});

	it('connects nothing when the folder is not the library, or has no develop to read', async () => {
		const kept = new FolderMemory(join(home, 'settings', 'design-system.json'), 'folder');
		await expect(connectLibrary(upstream, kept)).rejects.toThrow(/is not a clone of a GitHub repository/);
		g(clone, 'update-ref', '-d', 'refs/remotes/origin/develop');
		await expect(connectLibrary(clone, kept)).rejects.toThrow(/has no develop branch from GitHub/);
		expect(kept.read()).toBeNull();
	});

	it('drops a connection that no longer points at the library', async () => {
		const kept = new FolderMemory(join(home, 'settings', 'design-system.json'), 'folder');
		await connectLibrary(clone, kept);
		g(clone, 'remote', 'set-url', 'origin', 'https://github.com/flocksafety/flock-coke.git');
		expect(locateLibrary(kept, () => null)).toEqual({ root: null, lost: clone });
	});
});
