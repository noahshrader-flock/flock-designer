import { existsSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Finding the product repository without being told where it is.
 *
 * A repository that DSNR can work in says so itself: it has a
 * `.dsnr/workspace.json`. That file is the marker, so there is nothing to
 * register and nothing that can drift out of date. People keep their clones in
 * a handful of places, so those are looked through, one level deep, and the
 * most recently used match wins; the person can change it, but is not asked.
 */

/** Folders, relative to the home folder, that hold nothing but code. Where a clone goes when none is chosen. */
export const CODE_FOLDERS = ['Documents/GitHub', 'GitHub', 'github', 'code', 'dev', 'src', 'repos', 'projects', 'workspace', 'Developer'];
/** Where discovery looks, relative to the home folder: the code folders, then Documents and the home folder itself. */
const ROOTS = [...CODE_FOLDERS, 'Documents', ''];

export interface DiscoveryDeps {
	home: string;
	exists: (path: string) => boolean;
	list: (dir: string) => string[];
	/** Last activity in a repository, as a timestamp. Larger is more recent. */
	activity: (repo: string) => number;
	/**
	 * What a path is on disk. macOS folders are case-insensitive, so `GitHub` and `github` are one folder
	 * reached two ways, and without this every repository in it was found twice.
	 */
	real?: (path: string) => string;
	/** Folders looked through first, given in full: the one this person's clones go in. */
	folders?: string[];
}

export const defaultDiscoveryDeps: DiscoveryDeps = {
	home: homedir(),
	exists: existsSync,
	list: (dir) => {
		try {
			return readdirSync(dir);
		} catch {
			return [];
		}
	},
	real: (path) => {
		try {
			return realpathSync.native(path);
		} catch {
			return path;
		}
	},
	activity: (repo) => {
		const times = ['HEAD', 'index'].map((f) => {
			try {
				return statSync(join(repo, '.git', f)).mtimeMs;
			} catch {
				return 0;
			}
		});
		return Math.max(...times);
	},
};

export const findProductCheckouts = (deps: DiscoveryDeps = defaultDiscoveryDeps): string[] =>
	findRepositories(deps, (dir) => deps.exists(join(dir, '.dsnr', 'workspace.json')));

/**
 * The clones in the usual places (and first the folders given) that `accept` takes, most recently used first. What
 * `accept` is given is a folder with a `.git`, which it may read as files; nothing is run in it.
 */
export const findRepositories = (deps: DiscoveryDeps, accept: (dir: string) => boolean): string[] => {
	const seen = new Set<string>();
	const found: string[] = [];
	for (const base of [...(deps.folders ?? []), ...ROOTS.map((root) => (root === '' ? deps.home : join(deps.home, root)))]) {
		// A bounded look: a folder with thousands of entries is not where clones live.
		for (const name of deps.list(base).slice(0, 500)) {
			if (name.startsWith('.') || name === 'node_modules' || name === 'Library') continue;
			const dir = join(base, name);
			if (!deps.exists(join(dir, '.git')) || !accept(dir)) continue;
			// The first way a repository was reached is the one kept, so its path reads as it was found.
			const key = deps.real?.(dir) ?? dir;
			if (seen.has(key)) continue;
			seen.add(key);
			found.push(dir);
		}
	}
	return found.sort((a, b) => deps.activity(b) - deps.activity(a));
};

/**
 * Where a product repository's design records live: the design repository
 * cloned beside it. Null when it is not there, which the app reports rather
 * than creating a folder outside any repository.
 */
export const recordsRootFor = (productRoot: string, exists: (p: string) => boolean = existsSync): string | null => {
	const sibling = join(productRoot, '..', 'flock-designer');
	return exists(join(sibling, '.git')) ? join(sibling, 'projects') : null;
};
