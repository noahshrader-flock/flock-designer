import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Which files hold GitHub's own addresses, REST paths, sign-in or command line, so that adding GitLab is adding a
 * provider and not a search. Outside GitHub's home, each file that reaches it is named below with what it holds; a new
 * one fails here, and so does a name whose file stops reaching it, so the list is exactly what is left to move.
 * Wording that only says "GitHub" is not counted: it comes from `HOST`.
 */

const workspace = join(__dirname, '..');
const ROOTS = ['src', 'extension/src', 'extension/webview', 'bin'];

const files = (dir: string): string[] =>
	readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		return statSync(path).isDirectory() ? files(path) : /\.(tsx?|mjs)$/.test(name) && !name.endsWith('.d.ts') ? [path] : [];
	});

const GITHUB: Record<string, RegExp> = {
	address: /api\.github\.com|\bgithub\.com\b|githubusercontent|github\.io|\.github\//,
	'REST path': /repoApiPath\(|\.api\(\s*[`'"]\//,
	'sign-in': /getSession\(\s*['"]github['"]/,
	'command line': /['"]gh['"]|\bgh (?:api|pr|auth|repo)\b/,
};

/** Without its comments: a comment may name GitHub, as this one does. */
const code = (text: string): string =>
	text
		.replace(/\/\*[\s\S]*?\*\//g, '')
		.replace(/^\s*\/\/.*$/gm, '')
		.replace(/\s\/\/[^'"`\n]*$/gm, '');

const reaching = (text: string): string[] =>
	Object.entries(GITHUB)
		.filter(([, pattern]) => pattern.test(code(text)))
		.map(([kind]) => kind);

/** GitHub's home: the host's folder, and the one place each for its addresses and its words. */
const isHome = (path: string): boolean =>
	path.startsWith('src/codeHost/') || path === 'src/shared/hostUrls.ts' || path === 'src/shared/vocabulary.ts';

const TO_MOVE: Record<string, string> = {
	'src/core/services/publishing/pages.ts': 'GitHub Pages: visibility, deployments, workflow runs and dispatch, compare (Phase 5)',
	'src/core/services/publishing/profileNames.ts': 'a person’s profile, `/users/<login>` (2.3)',
	'src/cli/wcagEdition.ts': 'the weekly WCAG check opens an issue by its REST path (2.3)',
	'src/core/services/platform/ghCli.ts': 'the person’s own `gh`; GitLab’s is `glab` (Phase 4)',
	'src/core/services/codebase/install.ts': 'says how to sign npm in to GitHub Packages when a private package is refused (Phase 6)',
	'extension/src/github.ts': 'VS Code’s built-in GitHub sign-in; GitLab needs its own account (3.1)',
};

const scanned = ROOTS.flatMap((root) => files(join(workspace, root))).map((path) => ({
	path: relative(workspace, path),
	kinds: reaching(readFileSync(path, 'utf8')),
}));

describe('where GitHub is', () => {
	it('finds what it looks for: GitHub’s address, a REST path, its sign-in and its command line, but not a comment', () => {
		expect(reaching("fetch('https://api.github.com/user')")).toEqual(['address']);
		expect(reaching('await github.api(`/users/${login}`)')).toEqual(['REST path']);
		expect(reaching("auth.getSession('github', scopes)")).toEqual(['sign-in']);
		expect(reaching("findOnPath('gh', env)")).toEqual(['command line']);
		expect(reaching('// see https://github.com/cli/cli\nconst x = 1;')).toEqual([]);
	});

	it('reaches GitHub only from its home and the files still to move', () => {
		const stray = scanned.filter((f) => f.kinds.length > 0 && !isHome(f.path) && !(f.path in TO_MOVE));
		expect(stray.map((f) => `${f.path}: ${f.kinds.join(', ')}`)).toEqual([]);
	});

	it('names only files that still reach GitHub: one that no longer does comes off the list', () => {
		const done = Object.keys(TO_MOVE).filter((path) => !(scanned.find((f) => f.path === path)?.kinds.length ?? 0));
		expect(done).toEqual([]);
	});
});
