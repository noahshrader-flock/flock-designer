/** `owner/repo` where a repository is kept or shown, `RepoRef` where the host's API is called; split and joined only here. */

export interface RepoRef {
	owner: string;
	repo: string;
}

/** In any of the forms git writes a GitHub remote; null for anything else. */
export const parseRemote = (url: string): string | null => {
	const m = /^(?:https:\/\/(?:[^@/]+@)?github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/i.exec(url.trim());
	return m?.[1] ?? null;
};

export const asRepositoryPath = (v: unknown): string | null =>
	typeof v === 'string' && /^[\w.-]+\/[\w.-]+$/.test(v) && !v.split('/').some((p) => p === '.' || p === '..') ? v : null;

export const repoRefOf = (path: string): RepoRef => {
	const [owner = '', repo = ''] = path.split('/');
	return { owner, repo };
};

export const repoName = (path: string): string => repoRefOf(path).repo;

export const formatRepo = (ref: RepoRef): string => `${ref.owner}/${ref.repo}`;
