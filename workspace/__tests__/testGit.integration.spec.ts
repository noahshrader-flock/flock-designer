import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

/** Git as the tests see it (`__tests__/gitconfig`, set in vitest.config.ts): never the person's own identity or signing. */
describe('the tests’ git', () => {
	const config = (key: string) => execFileSync('git', ['config', '--get', key], { encoding: 'utf8' }).trim();

	it('commits as the test identity, unsigned, on every machine', () => {
		expect([config('user.name'), config('user.email'), config('commit.gpgsign')]).toEqual(['Test', 'test@example.test', 'false']);
	});
});
