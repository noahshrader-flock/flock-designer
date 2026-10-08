import type { Catalog, CatalogUpdate } from '../../shared/contract';
import { readCatalog, type CatalogReads } from './componentCatalog';
import { defaultDiscoveryDeps, findRepositories, type DiscoveryDeps } from './discovery';
import { runGit } from './git';
import { gitHubRepoOf, originOf } from './repositories';

/**
 * The component library on this machine, for the Design System tab: found, kept up to date, and read.
 *
 * **`develop` is the source of truth** (DESIGN_SYSTEM_PLAN.md, decision 4), so what is read is git's copy of GitHub's
 * `develop`, `origin/develop`, and never the folder: whatever branch the clone has checked out, and whatever is
 * unfinished in it, makes no difference. Bringing it up to date is a fetch of that one ref, which moves no branch and
 * writes no file. Nothing is checked out, and no code from the library is run.
 */

export const LIBRARY = 'flocksafety/flock-react-component-lib';
export const DEVELOP = 'refs/remotes/origin/develop';
const FETCH_TIMEOUT_MS = 120_000;

/** The library's clones in the usual places, and first the folders given (the clone folder), most recently used first. */
export const findLibrary = (deps: DiscoveryDeps & { origin?: (dir: string) => string | null } = defaultDiscoveryDeps): string | null => {
	const origin = deps.origin ?? originOf;
	return (
		findRepositories(deps, (dir) => {
			const remote = origin(dir);
			return remote !== null && gitHubRepoOf(remote)?.toLowerCase() === LIBRARY;
		})[0] ?? null
	);
};

/** What git said when a fetch failed, in words a person can act on. */
export const fetchProblem = (stderr: string): string => {
	if (/Authentication failed|could not read (Username|Password)|terminal prompts disabled|Repository not found|Permission denied \(publickey\)|403/i.test(stderr)) {
		return 'GitHub would not let git on this computer read the library: git is not signed in to GitHub, or this account cannot read it. Run `gh auth setup-git` in a terminal (with the GitHub CLI signed in), or sign in to git.';
	}
	if (/Could not resolve host|Failed to connect|Connection (timed out|refused|reset)|Network is unreachable|unable to access|timed out|SIGTERM/i.test(stderr)) {
		return 'Could not reach GitHub. Check the internet connection.';
	}
	if (/couldn't find remote ref|no such ref/i.test(stderr)) return 'GitHub has no develop branch for the library.';
	const said = stderr.trim().split('\n').pop()?.replace(/^fatal:\s*/, '') ?? '';
	return `Git could not update the library: ${said || 'it stopped without saying why.'}`;
};

/** The commit `origin/develop` is at, or null when the clone has none. */
const developCommit = async (root: string): Promise<string | null> => {
	try {
		return (await runGit(root, ['rev-parse', '--verify', '--quiet', `${DEVELOP}^{commit}`])) || null;
	} catch {
		return null;
	}
};

/**
 * Brings `origin/develop` up to date from GitHub, and nothing else: an explicit refspec, so no other ref moves, no tags,
 * no submodules. Never throws; a failure is said in words.
 */
export const updateLibrary = async (root: string): Promise<Exclude<CatalogUpdate, 'updating'>> => {
	const before = await developCommit(root);
	try {
		await runGit(root, ['fetch', '--quiet', '--no-tags', '--no-recurse-submodules', 'origin', `+refs/heads/develop:${DEVELOP}`], FETCH_TIMEOUT_MS);
	} catch (err) {
		return { failed: fetchProblem((err as Error).message) };
	}
	return (await developCommit(root)) === before ? 'unchanged' : 'updated';
};

/**
 * The catalog's two reads, on `origin/develop` through git. Listing a folder also reads every story in it with one
 * `git cat-file --batch`, so the files the catalog asks for next are already here: one git process for eighty stories,
 * not eighty. A file not read that way is read on its own.
 */
export const libraryReads = (root: string): CatalogReads => {
	const read = new Map<string, Promise<Map<string, string>>>();
	const readStories = async (paths: string[]): Promise<Map<string, string>> => {
		// A header no story can contain, then the object as git stores it; `%(rest)` gives back the path asked for.
		const mark = `@@flock-designer-${Math.random().toString(36).slice(2)}@@`;
		const out = await runGit(root, ['cat-file', `--batch=${mark} %(objecttype) %(rest)`], undefined, undefined, paths.map((p) => `${DEVELOP}:${p} ${p}\n`).join(''));
		const files = new Map<string, string>();
		for (const chunk of `\n${out}`.split(`\n${mark} `).slice(1)) {
			const newline = chunk.indexOf('\n');
			const [type, path] = [chunk.slice(0, chunk.indexOf(' ')), chunk.slice(chunk.indexOf(' ') + 1, newline)];
			if (type === 'blob') files.set(path, chunk.slice(newline + 1));
		}
		return files;
	};
	return {
		listFiles: async (dir) => {
			const files = (await runGit(root, ['ls-tree', '-r', '--name-only', DEVELOP, '--', dir])).split('\n').filter(Boolean);
			const stories = files.filter((f) => /\.stories\.tsx$/.test(f) && !/\s/.test(f));
			if (stories.length > 0) read.set(dir, readStories(stories).catch(() => new Map()));
			return files;
		},
		readFile: async (path) => {
			for (const batch of read.values()) {
				const text = (await batch).get(path);
				if (text !== undefined) return text;
			}
			return runGit(root, ['show', `${DEVELOP}:${path}`]);
		},
	};
};

/** The catalog as `origin/develop` has it now, with `update` as given. */
export const readLibrary = async (root: string, update: CatalogUpdate): Promise<Catalog> => {
	const commit = await developCommit(root);
	if (commit === null) return { state: 'no-develop', root };
	const committedAt = await runGit(root, ['log', '-1', '--format=%cI', commit]);
	return { state: 'ready', commit, committedAt, update, components: await readCatalog(libraryReads(root)) };
};

export interface DesignLibraryDeps {
	/** Where the library's clone is now, or null. Asked on every call, so a clone made since is found. */
	find: () => string | null;
	update?: (root: string) => Promise<Exclude<CatalogUpdate, 'updating'>>;
	read?: (root: string, update: CatalogUpdate) => Promise<Catalog>;
}

/**
 * What the tab asks for. The first ask answers at once with what the clone has and starts one fetch; an ask with
 * `refresh` waits for the fetch that is running, or starts one, and answers with its outcome. One fetch at a time per
 * clone.
 */
export class DesignLibrary {
	private fetching = new Map<string, Promise<Exclude<CatalogUpdate, 'updating'>>>();
	/** The last fetch's outcome for each clone, so a later ask without `refresh` says how current the list is. */
	private outcome = new Map<string, Exclude<CatalogUpdate, 'updating'>>();

	constructor(private readonly deps: DesignLibraryDeps) {}

	async catalog(refresh: boolean): Promise<Catalog> {
		const root = this.deps.find();
		if (root === null) return { state: 'no-clone', repository: LIBRARY };
		const read = this.deps.read ?? readLibrary;
		if (refresh) return read(root, await this.fetch(root));
		// Read before fetching: git runs one command at a time per repository, so the list waits for nothing.
		const last = this.outcome.get(root);
		const now = await read(root, last ?? 'updating');
		if (last === undefined) void this.fetch(root);
		return now;
	}

	private fetch(root: string): Promise<Exclude<CatalogUpdate, 'updating'>> {
		const running = this.fetching.get(root);
		if (running) return running;
		const update = this.deps.update ?? updateLibrary;
		const started = update(root).then((outcome) => {
			this.outcome.set(root, outcome);
			this.fetching.delete(root);
			return outcome;
		});
		this.fetching.set(root, started);
		return started;
	}
}

/** Where to look for the library: the clone folder first, then the usual places. */
export const libraryFinder = (cloneFolder: () => string, deps: DiscoveryDeps = defaultDiscoveryDeps) => () =>
	findLibrary({ ...deps, folders: [cloneFolder()] });
