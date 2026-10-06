import { describe, expect, it, vi } from 'vitest';
import { gitHubRepoOf, mergeRepositories, originOf, visibleRepositories } from '../src/main/services/repositories';

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
	it('reads every page GitHub has, and stops at the first short one', async () => {
		const page = (n: number, count: number) => Array.from({ length: count }, (_, i) => ({ full_name: `o/r${n}-${i}` }));
		const api = vi.fn(async (path: string) => (path.endsWith('page=1') ? page(1, 100) : page(2, 3)));
		const names = await visibleRepositories({ api } as never);
		expect(names).toHaveLength(103);
		expect(api).toHaveBeenCalledTimes(2);
		expect(api.mock.calls[0]?.[0]).toContain('affiliation=owner,collaborator,organization_member');
	});
});
