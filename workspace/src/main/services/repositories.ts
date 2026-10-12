import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { Repository, RepositoryReach } from '../../shared/contract';
import type { GitHubSession } from './githubSession';
import { readPages } from './paging';

/**
 * The repositories new work can start in: every one the signed-in person can see on GitHub, matched to its
 * clone on this machine where there is one, plus any clone here that GitHub did not list.
 *
 * A clone is matched by its `origin` remote, read from `.git/config` as a file. Nothing is run in a
 * repository to do it: these are clones discovery found, which the person has not accepted yet.
 */

/**
 * The `origin` remote's URL from a clone's `.git/config`, or null: no process, for scanning many folders. It does not
 * apply `insteadOf` or follow a worktree's `.git` file; for one repository, ask git (`originUrl`).
 */
export const originOf = (root: string, read: (path: string) => string = (p) => readFileSync(p, 'utf8')): string | null => {
	let config: string;
	try {
		config = read(join(root, '.git', 'config'));
	} catch {
		return null;
	}
	const section = /\[remote "origin"\]([^[]*)/.exec(config)?.[1] ?? '';
	return /^\s*url\s*=\s*(.+)$/m.exec(section)?.[1]?.trim() ?? null;
};

/** `repository` as `list` names it, matched without case as GitHub matches names, or undefined when it is not there. */
export const listedAs = (list: string[], repository: string): string | undefined => {
	const wanted = String(repository).toLowerCase();
	return list.find((r) => r.toLowerCase() === wanted);
};

/**
 * GitHub's list (most recently pushed first, as GitHub returns it) with each repository's clone filled in,
 * then the clones GitHub did not list. Names compare without case, as GitHub's do.
 */
export const mergeRepositories = (remote: string[], clones: { root: string; repo: string | null }[]): Repository[] => {
	const byRepo = new Map(clones.filter((c) => c.repo).map((c) => [(c.repo as string).toLowerCase(), c.root]));
	const listed = new Set(remote.map((r) => r.toLowerCase()));
	return [
		...remote.map((name) => ({ name, root: byRepo.get(name.toLowerCase()) ?? null })),
		...clones.filter((c) => !c.repo || !listed.has(c.repo.toLowerCase())).map((c) => ({ name: c.repo ?? basename(c.root), root: c.root })),
	];
};

/**
 * Every repository the signed-in person can see, by `owner/repo`, most recently pushed first. GitHub decides
 * what is visible, so this follows their permissions exactly. Bounded, at a thousand: past that the search
 * box is what finds one. The first page is asked alone; when it is full, the rest are asked at once, since each ask can
 * be a second or more (through GitHub's command line, a process each), and read up to the first that is not full.
 */
export const visibleRepositories = async (session: Pick<GitHubSession, 'api'>, maxPages = 10): Promise<string[]> => {
	const repos = await readPages(session, '/user/repos?affiliation=owner,collaborator,organization_member&sort=pushed', {
		maxPages,
		together: true,
		atMost: 'stop',
	});
	return repos.map((r) => (r as { full_name?: unknown }).full_name).filter((name): name is string => typeof name === 'string');
};

/**
 * Every repository the signed-in person's account reaches: what their own GitHub sign-in sees (its command line, when it
 * is here and signed in; every organization's repositories, as their account does), then any the app's sign-in sees that
 * it did not. The app's own sign-in is a GitHub App, which sees only the repositories it is installed on; this is how a
 * repository the person can open on GitHub is never missing here. **The command line's list is taken only when it is
 * signed in as the same person as the app** (`login`): another account's repositories are not this person's. Each named
 * once, whatever its case. Asked at once, as each can take a second or more. Says how far the list reaches: `account`
 * when the person's own list is in it, `app` when it is only what the app's GitHub App is installed on.
 */
export const reachableRepositories = async (
	app: Pick<GitHubSession, 'api'>,
	person: Pick<GitHubSession, 'api'> | null,
	login: string | null,
): Promise<{ names: string[]; reach: Exclude<RepositoryReach, 'none'> }> => {
	// Null when the command line's list is not this person's: missing, signed out, or another account.
	const theirs = async (): Promise<string[] | null> => {
		if (person === null || login === null) return null;
		const [who, names] = await Promise.all([person.api('/user').catch(() => null), visibleRepositories(person).catch(() => [])]);
		const same =
			typeof (who as { login?: unknown } | null)?.login === 'string' && (who as { login: string }).login.toLowerCase() === login.toLowerCase();
		return same && who !== null ? names : null;
	};
	const [mine, apps] = await Promise.all([theirs(), visibleRepositories(app).catch(() => [])]);
	const seen = new Set<string>();
	const names = [...(mine ?? []), ...apps].filter((name) => {
		const key = name.toLowerCase();
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
	return { names, reach: mine === null ? 'app' : 'account' };
};
