/**
 * A repository on its host, said one way: as a reference (`RepoRef`) where the host's API is called, and as its path,
 * `owner/repo`, where it is kept or shown (a record, the app's settings, the window). Read from a remote, checked,
 * split and joined only here.
 */

/** A repository, by its owner and its name. */
export interface RepoRef {
	owner: string;
	repo: string;
}

/** `owner/repo` from a GitHub remote, in any of the forms git writes one. Null for anything else. */
export const parseRemote = (url: string): string | null => {
	const m = /^(?:https:\/\/(?:[^@/]+@)?github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/i.exec(url.trim());
	return m?.[1] ?? null;
};

/** A repository's path as a record or the window gives it, or null when it is not one: the host's characters, never `.` or `..`. */
export const asRepositoryPath = (v: unknown): string | null =>
	typeof v === 'string' && /^[\w.-]+\/[\w.-]+$/.test(v) && !v.split('/').some((p) => p === '.' || p === '..') ? v : null;

/** A path's reference: `flocksafety/flock-coke` is owner `flocksafety`, repo `flock-coke`. */
export const repoRefOf = (path: string): RepoRef => {
	const [owner = '', repo = ''] = path.split('/');
	return { owner, repo };
};

/** A repository's own name, without its owner: `flock-coke`. */
export const repoName = (path: string): string => repoRefOf(path).repo;

/** A reference's path, `owner/repo`. */
export const formatRepo = (ref: RepoRef): string => `${ref.owner}/${ref.repo}`;
