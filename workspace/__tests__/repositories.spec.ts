import { describe, expect, it, vi } from 'vitest';
import { gitHubRepoOf, mergeRepositories, originOf, reachableRepositories, visibleRepositories } from '../src/main/services/repositories';

describe('gitHubRepoOf', () => {
	it('reads owner/repo from each form git writes a GitHub remote in', () => {
		expect(gitHubRepoOf('https://github.com/flock-safety/flock-coke.git')).toBe('flock-safety/flock-coke');
		expect(gitHubRepoOf('https://github.com/flock-safety/flock-coke')).toBe('flock-safety/flock-coke');
		expect(gitHubRepoOf('git@github.com:flock-safety/flock-coke.git')).toBe('flock-safety/flock-coke');
		expect(gitHubRepoOf('ssh://git@github.com/flock-safety/flock-coke.git')).toBe('flock-safety/flock-coke');
		expect(gitHubRepoOf('https://x-access-token@github.com/a/b.git')).toBe('a/b');
	});

	it('is null for anything that is not GitHub', () => {
		expect(gitHubRepoOf('https://gitlab.com/a/b.git')).toBeNull();
		expect(gitHubRepoOf('/srv/git/b.git')).toBeNull();
	});
});

describe('originOf', () => {
	it('reads the origin remote from .git/config, and only origin', () => {
		const config = '[core]\n\tbare = false\n[remote "upstream"]\n\turl = git@github.com:up/x.git\n[remote "origin"]\n\turl = git@github.com:me/x.git\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n';
		expect(originOf('/r', () => config)).toBe('git@github.com:me/x.git');
	});

	it('is null with no origin, or no config to read', () => {
		expect(originOf('/r', () => '[core]\n')).toBeNull();
		expect(
			originOf('/r', () => {
				throw new Error('ENOENT');
			}),
		).toBeNull();
	});
});

describe('mergeRepositories', () => {
	it("keeps GitHub's order, fills in each clone, and adds clones GitHub did not list", () => {
		const r = mergeRepositories(['Flock-Safety/flock-coke', 'flock-safety/other'], [
			{ root: '/c/flock-coke', repo: 'flock-safety/flock-coke' },
			{ root: '/c/fork', repo: 'me/fork' },
			{ root: '/c/plain', repo: null },
		]);
		expect(r).toEqual([
			{ name: 'Flock-Safety/flock-coke', root: '/c/flock-coke' },
			{ name: 'flock-safety/other', root: null },
			{ name: 'me/fork', root: '/c/fork' },
			{ name: 'plain', root: '/c/plain' },
		]);
	});
});

describe('visibleRepositories', () => {
	const page = (n: number, count: number) => Array.from({ length: count }, (_, i) => ({ full_name: `o/r${n}-${i}` }));

	it('reads every page GitHub has, up to the first that is not full, in order', async () => {
		const api = vi.fn(async (path: string) => {
			const n = Number(/page=(\d+)$/.exec(path)?.[1]);
			return n <= 2 ? page(n, 100) : n === 3 ? page(3, 3) : page(n, 100);
		});
		const names = await visibleRepositories({ api } as never);
		expect(names).toHaveLength(203);
		expect(names[0]).toBe('o/r1-0');
		expect(names.at(-1)).toBe('o/r3-2');
		expect(api.mock.calls[0]?.[0]).toContain('affiliation=owner,collaborator,organization_member');
	});

	it('asks for one page alone when it is not full, and for the rest at once when it is', async () => {
		const short = vi.fn(async () => page(1, 3));
		expect(await visibleRepositories({ api: short } as never)).toHaveLength(3);
		expect(short).toHaveBeenCalledTimes(1);
		let running = 0;
		let most = 0;
		const full = vi.fn(async (path: string) => {
			running++;
			most = Math.max(most, running);
			await new Promise((r) => setTimeout(r, 5));
			running--;
			return path.endsWith('page=1') ? page(1, 100) : page(2, 0);
		});
		await visibleRepositories({ api: full } as never);
		// After the first, the other nine were asked together, not one after another.
		expect(full).toHaveBeenCalledTimes(10);
		expect(most).toBe(9);
	});
});

describe('reachableRepositories', () => {
	/** A GitHub sign-in that lists `names`, signed in as `login`. */
	const listing = (names: string[], login = 'noah') => ({
		api: vi.fn(async (path: string) => (path === '/user' ? { login } : names.map((full_name) => ({ full_name })))),
	});

	it('is every repository the person’s account reaches: their own GitHub sign-in’s, then any the app’s sees that it did not', async () => {
		const app = listing(['flocksafety/flock-designer', 'flocksafety/flock-coke']);
		const person = listing(['flocksafety/flock-coke', 'flocksafety/flock-react-component-lib', 'noah/sandbox']);
		expect(await reachableRepositories(app, person, 'noah')).toEqual(['flocksafety/flock-coke', 'flocksafety/flock-react-component-lib', 'noah/sandbox', 'flocksafety/flock-designer']);
	});

	it('names a repository once, whatever its case', async () => {
		expect(await reachableRepositories(listing(['Acme/UI']), listing(['acme/ui']), 'noah')).toEqual(['acme/ui']);
	});

	it('takes the command line’s list only when it is signed in as the same person as the app, whatever the case of the name', async () => {
		const someoneElse = listing(['other/private'], 'pat');
		expect(await reachableRepositories(listing(['flocksafety/flock-coke']), someoneElse, 'noah')).toEqual(['flocksafety/flock-coke']);
		expect(await reachableRepositories(listing(['a/b']), listing(['c/d'], 'Noah'), 'noah')).toEqual(['c/d', 'a/b']);
	});

	it('is the app’s list alone when the person’s GitHub command line is missing or signed out, or nobody is signed in to the app', async () => {
		const missing = { api: vi.fn(async () => Promise.reject(new Error('gh: command not found'))) };
		expect(await reachableRepositories(listing(['flocksafety/flock-coke']), missing, 'noah')).toEqual(['flocksafety/flock-coke']);
		expect(await reachableRepositories(listing(['flocksafety/flock-coke']), null, 'noah')).toEqual(['flocksafety/flock-coke']);
		expect(await reachableRepositories(listing(['flocksafety/flock-coke']), listing(['c/d']), null)).toEqual(['flocksafety/flock-coke']);
	});
});
