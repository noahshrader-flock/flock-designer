import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { Repository } from '../../shared/contract';
import type { GitHubSession } from './githubSession';

/**
 * The repositories new work can start in: every one the signed-in person can see on GitHub, matched to its
 * clone on this machine where there is one, plus any clone here that GitHub did not list.
 *
 * A clone is matched by its `origin` remote, read from `.git/config` as a file. Nothing is run in a
 * repository to do it: these are clones discovery found, which the person has not accepted yet.
 */

/** `owner/repo` from a GitHub remote, in any of the forms git writes one. Null for anything else. */
export const gitHubRepoOf = (remote: string): string | null => {
	const m = /^(?:https:\/\/(?:[^@/]+@)?github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/i.exec(remote.trim());
	return m?.[1] ?? null;
};

/** The `origin` remote's URL from a clone's `.git/config`, or null. */
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
 * box is what finds one.
 */
export const visibleRepositories = async (session: Pick<GitHubSession, 'api'>, maxPages = 10): Promise<string[]> => {
	const names: string[] = [];
	for (let page = 1; page <= maxPages; page++) {
		const batch = await session.api(`/user/repos?affiliation=owner,collaborator,organization_member&sort=pushed&per_page=100&page=${page}`);
		const items = Array.isArray(batch) ? batch : [];
		for (const r of items) {
			const name = (r as { full_name?: unknown }).full_name;
			if (typeof name === 'string') names.push(name);
		}
		if (items.length < 100) break;
	}
	return names;
};
