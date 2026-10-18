import { describe, expect, it } from 'vitest';
import { originOf } from '../src/core/services/projects/repositories';

describe('originOf', () => {
	it('reads the origin remote from .git/config, and only origin', () => {
		const config =
			'[core]\n\tbare = false\n[remote "upstream"]\n\turl = git@github.com:up/x.git\n[remote "origin"]\n\turl = git@github.com:me/x.git\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n';
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
