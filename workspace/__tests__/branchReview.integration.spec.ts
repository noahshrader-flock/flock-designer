import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { reviewBranch } from '../src/core/services/designSystem/branchReview';
import { g } from './fixtures';

/** A hand-over branch is read from git, never from what Claude Code says. */

let home: string;
let clone: string;
let base: string;
const BRANCH = 'dsnr/handoff-20261017-ab12';
const write = (file: string, text: string) => {
	mkdirSync(dirname(join(clone, file)), { recursive: true });
	writeFileSync(join(clone, file), text);
};
const commitOn = (files: Record<string, string>, message = 'change') => {
	for (const [file, text] of Object.entries(files)) write(file, text);
	g(clone, 'add', '-A');
	g(clone, 'commit', '-q', '-m', message);
};

beforeEach(() => {
	home = mkdtempSync(join(tmpdir(), 'dsnr-branch-review-'));
	const upstream = join(home, 'upstream');
	clone = join(home, 'ui');
	g(home, 'init', '-q', '--bare', '-b', 'develop', join(home, 'remote.git'));
	mkdirSync(upstream);
	g(upstream, 'init', '-q', '-b', 'develop');
	g(upstream, 'config', 'user.name', 'Noah');
	g(upstream, 'config', 'user.email', 'noah@example.com');
	writeFileSync(join(upstream, 'theme.ts'), 'export const radius = 8;\n');
	g(upstream, 'add', '-A');
	g(upstream, 'commit', '-q', '-m', 'library');
	g(upstream, 'remote', 'add', 'origin', join(home, 'remote.git'));
	g(upstream, 'push', '-q', 'origin', 'develop');
	g(home, 'clone', '-q', join(home, 'remote.git'), clone);
	g(clone, 'config', 'user.name', 'Noah');
	g(clone, 'config', 'user.email', 'noah@example.com');
	base = g(clone, 'rev-parse', 'origin/develop');
});
afterEach(() => rmSync(home, { recursive: true, force: true }));

describe('a hand-over branch, as DSNR reads it before it is proposed', () => {
	it('is missing until it is made, and empty until something is committed on it', async () => {
		expect(await reviewBranch(clone, BRANCH, base, 'develop')).toEqual({ state: 'missing' });
		g(clone, 'switch', '-q', '-c', BRANCH, 'origin/develop');
		expect(await reviewBranch(clone, BRANCH, base, 'develop')).toEqual({ state: 'empty' });
	});

	it('reads a branch made from its base: its commits and each file changed, with its lines, none out of bounds', async () => {
		g(clone, 'switch', '-q', '-c', BRANCH, 'origin/develop');
		commitOn({ 'theme.ts': 'export const radius = 12;\n' });
		expect(await reviewBranch(clone, BRANCH, base, 'develop')).toEqual({
			state: 'ready',
			tip: g(clone, 'rev-parse', BRANCH),
			commits: 1,
			files: [{ path: 'theme.ts', added: 1, removed: 1, out: null }],
			lines: 2,
			large: false,
		});
	});

	it('says a story it changed is out of bounds', async () => {
		g(clone, 'switch', '-q', '-c', BRANCH, 'origin/develop');
		commitOn({ 'theme.ts': 'export const radius = 12;\n', 'src/Button.stories.tsx': 'export default {};\n' });
		const review = await reviewBranch(clone, BRANCH, base, 'develop');
		expect(review.state === 'ready' && review.files.map((f) => [f.path, f.out])).toEqual([
			['src/Button.stories.tsx', 'a story'],
			['theme.ts', null],
		]);
	});

	it('reads a path git would quote as it is, so a story with an unusual name is still out of bounds', async () => {
		g(clone, 'switch', '-q', '-c', BRANCH, 'origin/develop');
		commitOn({ 'src/Botón/Botón.stories.tsx': 'export default {};\n', 'src/with\ttab.test.ts': 'test;\n' });
		const review = await reviewBranch(clone, BRANCH, base, 'develop');
		expect(review.state === 'ready' && review.files.map((f) => [f.path, f.out])).toEqual([
			['src/Botón/Botón.stories.tsx', 'a story'],
			['src/with\ttab.test.ts', 'a test'],
		]);
	});

	it('says a branch made from another base is off its base, and is not read for files', async () => {
		g(clone, 'switch', '-q', '--orphan', BRANCH);
		commitOn({ 'other.ts': 'x\n' });
		expect(await reviewBranch(clone, BRANCH, base, 'develop')).toEqual({ state: 'off-base' });
	});

	it('counts only its own work when GitHub’s base has moved on since it was handed over', async () => {
		g(clone, 'switch', '-q', '-c', BRANCH, 'origin/develop');
		commitOn({ 'theme.ts': 'export const radius = 12;\n' });
		// Someone else's commit on develop, fetched after: the branch's diff is still only its own.
		g(clone, 'switch', '-q', '-c', 'theirs', 'origin/develop');
		commitOn({ 'other.ts': 'theirs\n' });
		g(clone, 'push', '-q', 'origin', 'theirs:develop');
		g(clone, 'fetch', '-q', 'origin');
		const review = await reviewBranch(clone, BRANCH, base, 'develop');
		expect(review.state === 'ready' && review.files.map((f) => f.path)).toEqual(['theme.ts']);
	});

	it('says a diff of more files or lines than a reviewer reads in one sitting is large', async () => {
		g(clone, 'switch', '-q', '-c', BRANCH, 'origin/develop');
		commitOn(Object.fromEntries(Array.from({ length: 11 }, (_, i) => [`src/part${i}.ts`, `export const v = ${i};\n`])));
		const review = await reviewBranch(clone, BRANCH, base, 'develop');
		expect(review.state === 'ready' && [review.files.length, review.large]).toEqual([11, true]);
	});
});
