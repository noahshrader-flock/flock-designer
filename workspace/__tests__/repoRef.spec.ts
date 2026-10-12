import { describe, expect, it } from 'vitest';
import { asRepositoryPath, formatRepo, parseRemote, repoName, repoRefOf } from '../src/shared/repoRef';

describe("a repository's reference", () => {
	it('reads owner/repo from each form git writes a GitHub remote in', () => {
		expect(parseRemote('https://github.com/flock-safety/flock-coke.git')).toBe('flock-safety/flock-coke');
		expect(parseRemote('https://github.com/flock-safety/flock-coke')).toBe('flock-safety/flock-coke');
		expect(parseRemote('git@github.com:flock-safety/flock-coke.git')).toBe('flock-safety/flock-coke');
		expect(parseRemote('ssh://git@github.com/flock-safety/flock-coke.git')).toBe('flock-safety/flock-coke');
		expect(parseRemote('https://x-access-token@github.com/a/b.git')).toBe('a/b');
	});

	it('is null for a remote that is not on GitHub', () => {
		expect(parseRemote('https://gitlab.com/a/b.git')).toBeNull();
		expect(parseRemote('/srv/git/b.git')).toBeNull();
	});

	it('takes a path as a record or the window gives it only when it is one: the host’s characters, never . or ..', () => {
		expect(asRepositoryPath('flocksafety/flock-coke')).toBe('flocksafety/flock-coke');
		for (const v of ['flock-coke', 'a/b/c', '../b', 'a/..', 'a b/c', 3, null]) expect(asRepositoryPath(v)).toBeNull();
	});

	it('is named, split and joined one way', () => {
		expect(repoName('flocksafety/flock-coke')).toBe('flock-coke');
		expect(repoRefOf('flocksafety/flock-coke')).toEqual({ owner: 'flocksafety', repo: 'flock-coke' });
		expect(formatRepo({ owner: 'flocksafety', repo: 'flock-coke' })).toBe('flocksafety/flock-coke');
	});
});
