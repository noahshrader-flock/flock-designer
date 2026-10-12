import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import type { ClonePlace } from '../../shared/contract';
import { asGitHubRepository } from '../../shared/validate';
import { CODE_FOLDERS } from './discovery';
import { FolderMemory } from './folderMemory';
import { gitHubRepoOf, listedAs, originOf } from './repositories';

/**
 * Where this person's clones go: one folder, theirs to choose, which discovery looks through first, so a repository the
 * app clones there is found like any other. Every repository in it is `<folder>/<repo name>`, so a product repository
 * and the design repository cloned into it sit side by side, as the app needs them to (`recordsRootFor`).
 *
 * Only the path is kept, and only as a preference: what may be cloned, and where exactly, is decided again each time.
 */
export class CloneFolderMemory extends FolderMemory {
	constructor(file: string) {
		super(file, 'folder');
	}
}

export interface CloneFolderDeps {
	home: string;
	exists: (p: string) => boolean;
	/** The product repositories discovery found, most recently used first. */
	clones: string[];
}

/**
 * Where clones go when the person has not chosen: beside the repository they last worked in, so the design repository
 * and that one stay together; else the first of the usual code folders that exists; else `~/Documents/GitHub`, which
 * the clone makes. Never the home folder or Documents itself.
 */
export const defaultCloneFolder = ({ home, exists, clones }: CloneFolderDeps): string => {
	const beside = clones[0];
	if (beside !== undefined) return path.dirname(beside);
	return CODE_FOLDERS.map((f) => path.join(home, f)).find(exists) ?? path.join(home, 'Documents', 'GitHub');
};

/** The folder in use: the one chosen, else the default. */
export const cloneFolderOf = (memory: Pick<CloneFolderMemory, 'read'>, deps: CloneFolderDeps): string => memory.read() ?? defaultCloneFolder(deps);

export const defaultCloneFolderDeps = (clones: string[]): CloneFolderDeps => ({ home: homedir(), exists: existsSync, clones });

export interface ClonePlaceDeps {
	exists: (p: string) => boolean;
	list: (dir: string) => string[];
	/** The `origin` remote of a clone, or null. */
	origin: (root: string) => string | null;
	/** The path module to join with, so Windows paths are tested on a Mac. */
	paths?: Pick<typeof path, 'join'>;
}

export const defaultClonePlaceDeps: ClonePlaceDeps = {
	exists: existsSync,
	list: (dir) => {
		try {
			return readdirSync(dir);
		} catch {
			return [];
		}
	},
	origin: (root) => originOf(root),
};

/**
 * Where `owner/repo` would be placed in `folder`: `<folder>/<repo>`. Throws for anything that is not a GitHub repository
 * name, so no path is ever made of one.
 */
export const clonePlace = (folder: string, repository: string, deps: ClonePlaceDeps = defaultClonePlaceDeps): ClonePlace => {
	const name = asGitHubRepository(repository)?.split('/')[1];
	if (name === undefined) throw new Error(`"${repository}" is not a GitHub repository name.`);
	const at = (deps.paths ?? path).join(folder, name);
	if (!deps.exists(at) || deps.list(at).length === 0) return { state: 'free', path: at };
	const origin = deps.exists((deps.paths ?? path).join(at, '.git')) ? deps.origin(at) : null;
	const repo = origin === null ? null : gitHubRepoOf(origin);
	if (repo !== null && listedAs([repo], repository) !== undefined) return { state: 'cloned', path: at };
	return {
		state: 'taken',
		path: at,
		why: repo !== null ? `${at} is already a clone of ${repo}.` : `${at} already exists, and is not a clone of ${repository}.`,
	};
};
