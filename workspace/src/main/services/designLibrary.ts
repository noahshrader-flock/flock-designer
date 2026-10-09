import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { DESIGN_SYSTEMS, designSystemNamed, isDesignSystem, type DesignSystem } from '../../shared/catalog';
import type { Catalog, CatalogUpdate } from '../../shared/contract';
import { isStoryFile, readCatalog, type CatalogReads } from './componentCatalog';
import { readTokens } from './designTokens';
import { defaultDiscoveryDeps, findRepositories, type DiscoveryDeps } from './discovery';
import { FolderMemory } from './folderMemory';
import { runGit } from './git';
import { gitHubRepoOf, originOf } from './repositories';

/**
 * The component library on this machine, for the Design System tab: connected or found, kept up to date, and read.
 *
 * **Its branch on GitHub is the source of truth** (`develop` for FUI; each design system names its own, in
 * `DESIGN_SYSTEMS`), so what is read is git's copy of it, `origin/<branch>`, and never the folder: whatever branch the
 * clone has checked out, and whatever is unfinished in it, makes no difference. Bringing it up to date is a fetch of that
 * one ref, which moves no branch and writes no file. Nothing is checked out, and no code from the library is run.
 */

/** The design system the Connect screen offers by name: the first, and today the only, one. */
export const LIBRARY = DESIGN_SYSTEMS[0]!.repository;
const FETCH_TIMEOUT_MS = 120_000;

/** Git's copy of a design system's branch on GitHub. */
export const branchRef = (library: DesignSystem): string => `refs/remotes/origin/${library.branch}`;

/** The repository a folder's `origin` points at on GitHub (`owner/repo`), read from its `.git/config` as a file, or null. */
const repositoryOf = (dir: string, origin: (dir: string) => string | null): string | null => {
	const remote = origin(dir);
	return remote === null ? null : gitHubRepoOf(remote);
};

/** The design system a clone is of, by its `origin`, or null when it is none of them. */
export const libraryAt = (root: string, origin: (dir: string) => string | null = originOf): DesignSystem | null => designSystemNamed(repositoryOf(root, origin));

/**
 * Why a folder cannot be the design system library, in words, or null when it can: it is a clone whose `origin` is the
 * library. A clone of a fork has a different `origin`, so it is refused like any other repository.
 */
export const whyNotLibrary = (dir: string, origin: (dir: string) => string | null = originOf, exists: (p: string) => boolean = existsSync): string | null => {
	if (!exists(join(dir, '.git'))) return `${dir} is not a git repository. Choose the folder you cloned ${LIBRARY} into.`;
	const repo = repositoryOf(dir, origin);
	if (repo === null) return `${dir} is not a clone of a GitHub repository. Choose the folder you cloned ${LIBRARY} into.`;
	return isDesignSystem(repo) ? null : `${dir} is a clone of ${repo}, not ${LIBRARY}.`;
};

/** The library's clones in the usual places, and first the folders given (the clone folder), most recently used first. */
export const findLibrary = (deps: DiscoveryDeps & { origin?: (dir: string) => string | null } = defaultDiscoveryDeps): string | null =>
	findRepositories(deps, (dir) => isDesignSystem(repositoryOf(dir, deps.origin ?? originOf)))[0] ?? null;

/** The design system the person connected, kept in the app's settings beside the checkout. */
export class DesignSystemMemory extends FolderMemory {
	constructor(file: string) {
		super(file, 'folder');
	}

	static defaultPath = (userData: string): string => join(userData, 'design-system.json');
}

/** Where the library is now, and the folder connected before if it is no longer the library (moved, deleted, changed). */
export interface LibraryLocation {
	root: string | null;
	lost: string | null;
}

/**
 * The connected folder while it is still the library; otherwise one found by itself in the usual places (decision 12), and
 * the connected folder, if there was one, said to be lost.
 */
export const locateLibrary = (memory: FolderMemory, find: () => string | null, check: (dir: string) => string | null = whyNotLibrary): LibraryLocation => {
	const connected = memory.read();
	if (connected !== null && check(connected) === null) return { root: connected, lost: null };
	const found = find();
	return { root: found, lost: found === null ? connected : null };
};

/** Connects a folder the person chose: refused, in words, unless it is a design system with its branch from GitHub to read. */
export const connectLibrary = async (dir: string, memory: FolderMemory): Promise<void> => {
	const why = whyNotLibrary(dir);
	if (why !== null) throw new Error(why);
	const library = libraryAt(dir)!; // whyNotLibrary took it only if it is one
	if ((await libraryCommit(dir, library)) === null) {
		throw new Error(`${dir} is a clone of ${library.repository}, but has no ${library.branch} branch from GitHub to read. Check this computer can reach GitHub, then try again.`);
	}
	memory.write(dir);
};

/** What git said when a fetch of `branch` failed, in words a person can act on. */
export const fetchProblem = (stderr: string, branch: string): string => {
	if (/Authentication failed|could not read (Username|Password)|terminal prompts disabled|Repository not found|Permission denied \(publickey\)|403/i.test(stderr)) {
		return 'GitHub would not let git on this computer read the library: git is not signed in to GitHub, or this account cannot read it. Run `gh auth setup-git` in a terminal (with the GitHub CLI signed in), or sign in to git.';
	}
	if (/Could not resolve host|Failed to connect|Connection (timed out|refused|reset)|Network is unreachable|unable to access|timed out|SIGTERM/i.test(stderr)) {
		return 'Could not reach GitHub. Check the internet connection.';
	}
	if (/couldn't find remote ref|no such ref/i.test(stderr)) return `GitHub has no ${branch} branch for the library.`;
	const said = stderr.trim().split('\n').pop()?.replace(/^fatal:\s*/, '') ?? '';
	return `Git could not update the library: ${said || 'it stopped without saying why.'}`;
};

/** The commit a clone's copy of its design system's branch is at, or null when it has none. */
export const libraryCommit = async (root: string, library: DesignSystem): Promise<string | null> => {
	try {
		return (await runGit(root, ['rev-parse', '--verify', '--quiet', `${branchRef(library)}^{commit}`])) || null;
	} catch {
		return null;
	}
};

/**
 * Brings the clone's copy of its design system's branch up to date from GitHub, and nothing else: an explicit refspec,
 * so no other ref moves, no tags, no submodules. Never throws; a failure is said in words.
 */
export const updateLibrary = async (root: string): Promise<Exclude<CatalogUpdate, 'updating'>> => {
	const library = libraryAt(root);
	if (library === null) return { failed: 'This folder is not a clone of a design system library.' };
	const before = await libraryCommit(root, library);
	try {
		await runGit(root, ['fetch', '--quiet', '--no-tags', '--no-recurse-submodules', 'origin', `+refs/heads/${library.branch}:${branchRef(library)}`], FETCH_TIMEOUT_MS);
	} catch (err) {
		return { failed: fetchProblem((err as Error).message, library.branch) };
	}
	return (await libraryCommit(root, library)) === before ? 'unchanged' : 'updated';
};

/**
 * The catalog's two reads, on `ref` (a commit, or the copy of a branch) through git. Listing also reads every story it lists with one
 * `git cat-file --batch`, so the files the catalog asks for next are already here: one git process for eighty stories,
 * not eighty. A file not read that way is read on its own.
 */
export const libraryReads = (root: string, ref: string): CatalogReads => {
	const read = new Map<string, Promise<Map<string, string>>>();
	const readStories = async (paths: string[]): Promise<Map<string, string>> => {
		// A header no story can contain, then the object as git stores it; `%(rest)` gives back the path asked for.
		const mark = `@@dsnr-${Math.random().toString(36).slice(2)}@@`;
		const out = await runGit(root, ['cat-file', `--batch=${mark} %(objecttype) %(rest)`], undefined, undefined, paths.map((p) => `${ref}:${p} ${p}\n`).join(''));
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
			const files = (await runGit(root, ['ls-tree', '-r', '--name-only', ref, ...(dir === '' ? [] : ['--', dir])])).split('\n').filter(Boolean);
			const stories = files.filter((f) => isStoryFile(f) && !/\s/.test(f));
			if (stories.length > 0) read.set(dir, readStories(stories).catch(() => new Map()));
			return files;
		},
		readFile: async (path) => {
			for (const batch of read.values()) {
				const text = (await batch).get(path);
				if (text !== undefined) return text;
			}
			return runGit(root, ['show', `${ref}:${path}`]);
		},
	};
};

/** The catalog as the clone's copy of its design system's branch has it now, with `update` as given. */
export const readLibrary = async (root: string, update: CatalogUpdate): Promise<Catalog> => {
	const library = libraryAt(root);
	if (library === null) return { state: 'no-clone', repository: LIBRARY, lost: root };
	const commit = await libraryCommit(root, library);
	if (commit === null) return { state: 'no-branch', root, branch: library.branch };
	const committedAt = await runGit(root, ['log', '-1', '--format=%cI', commit]);
	// The components and the tokens, from the same reads of the same commit.
	const reads = libraryReads(root, commit);
	const [components, tokens] = await Promise.all([readCatalog(reads, library), readTokens(reads)]);
	// The library's own token pages leave the list only when the panel has the tokens to show instead (decision 22).
	const listed = tokens.source !== null && library.tokenGroup !== null ? components.filter((c) => c.group !== library.tokenGroup) : components;
	return { state: 'ready', branch: library.branch, commit, committedAt, update, components: listed, tokens };
};

export interface DesignLibraryDeps {
	/** Where the library's clone is now. Asked on every call, so a clone made or connected since is found. */
	find: () => LibraryLocation;
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
		const { root, lost } = this.deps.find();
		if (root === null) return { state: 'no-clone', repository: LIBRARY, lost };
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

/** Where the library is: the one connected, else one found in the clone folder first, then the usual places. */
export const libraryFinder = (memory: FolderMemory, cloneFolder: () => string, deps: DiscoveryDeps = defaultDiscoveryDeps) => (): LibraryLocation =>
	locateLibrary(memory, () => findLibrary({ ...deps, folders: [cloneFolder()] }));
