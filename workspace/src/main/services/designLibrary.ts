import { existsSync } from 'node:fs';
import { designSystemOf, isTokenGroup } from '../../shared/catalog';
import type { Catalog, CatalogUpdate, ConnectedDesignSystem, DesignSystemConnection, FoundDesignSystem } from '../../shared/contract';
import { isStoryFile, readCatalog, type CatalogReads } from './componentCatalog';
import { readTokens } from './designTokens';
import { type DesignSystemsMemory, defaultBranch, designSystemId, filesOf, findDesignSystems, within } from './designSystems';
import { runGit } from './git';

/**
 * The connected design system on this machine, for the Design System tab: kept up to date, and read.
 *
 * **Its branch on GitHub is the source of truth** (the repository's default, decision 24), so what is read is git's copy
 * of it, `origin/<branch>`, and never the folder: whatever branch the clone has checked out, and whatever is unfinished in
 * it, makes no difference. Bringing it up to date is a fetch of that one ref, which moves no branch and writes no file.
 * Nothing is checked out, and no code from the library is run. In a monorepo only the design system's own package is read
 * (decision 25).
 */

const FETCH_TIMEOUT_MS = 120_000;

/** Git's copy of a branch on GitHub. */
export const branchRef = (branch: string): string => `refs/remotes/origin/${branch}`;

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

/** The commit a clone's copy of `branch` is at, or null when it has none. */
export const libraryCommit = async (root: string, branch: string): Promise<string | null> => {
	try {
		return (await runGit(root, ['rev-parse', '--verify', '--quiet', `${branchRef(branch)}^{commit}`])) || null;
	} catch {
		return null;
	}
};

/**
 * Brings the clone's copy of its design system's branch up to date from GitHub, and nothing else: an explicit refspec,
 * so no other ref moves, no tags, no submodules. Never throws; a failure is said in words.
 */
export const updateLibrary = async (root: string, branch: string): Promise<Exclude<CatalogUpdate, 'updating'>> => {
	const before = await libraryCommit(root, branch);
	try {
		await runGit(root, ['fetch', '--quiet', '--no-tags', '--no-recurse-submodules', 'origin', `+refs/heads/${branch}:${branchRef(branch)}`], FETCH_TIMEOUT_MS);
	} catch (err) {
		return { failed: fetchProblem((err as Error).message, branch) };
	}
	return (await libraryCommit(root, branch)) === before ? 'unchanged' : 'updated';
};

/**
 * The library's two reads, for the catalog and the tokens, on `ref` (a commit, or the copy of a branch) through git. Listing also reads every story it lists with one
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
	// A folder is listed once: the catalog and the tokens both list the whole library, from the same commit.
	const listed = new Map<string, Promise<string[]>>();
	const list = async (dir: string): Promise<string[]> => {
		const files = (await runGit(root, ['ls-tree', '-r', '--name-only', ref, ...(dir === '' ? [] : ['--', dir])])).split('\n').filter(Boolean);
		const stories = files.filter((f) => isStoryFile(f) && !/\s/.test(f));
		if (stories.length > 0) read.set(dir, readStories(stories).catch(() => new Map()));
		return files;
	};
	return {
		listFiles: (dir) => listed.get(dir) ?? listed.set(dir, list(dir)).get(dir)!,
		readFile: async (path) => {
			for (const batch of read.values()) {
				const text = (await batch).get(path);
				if (text !== undefined) return text;
			}
			return runGit(root, ['show', `${ref}:${path}`]);
		},
	};
};

/** The design system's own reads: its package of the repository (decision 25), at `commit`. */
export const systemReads = async (system: ConnectedDesignSystem, commit: string): Promise<CatalogReads> => {
	const all = libraryReads(system.root, commit);
	return within(all, filesOf(await all.listFiles(''), system.folder));
};

/** The catalog as the clone's copy of the design system's branch has it now, with `update` as given. */
export const readLibrary = async (system: ConnectedDesignSystem, update: CatalogUpdate): Promise<Catalog> => {
	const { root, branch } = system;
	const commit = await libraryCommit(root, branch);
	if (commit === null) return { state: 'no-branch', root, branch };
	const committedAt = await runGit(root, ['log', '-1', '--format=%cI', commit]);
	// The components and the tokens, from the same reads of the same commit.
	const reads = await systemReads(system, commit);
	const [components, tokens] = await Promise.all([readCatalog(reads, designSystemOf(system)), readTokens(reads)]);
	// The library's own token pages leave the list only when the panel has the tokens to show instead (decision 22).
	const shown = tokens.source !== null ? components.filter((c) => !isTokenGroup(c.group)) : components;
	return { state: 'ready', branch, commit, committedAt, update, components: shown, tokens };
};

export interface DesignLibraryDeps {
	/** The design systems connected, and which is shown: asked on every call, so one connected or switched since is used. */
	systems: DesignSystemsMemory;
	update?: (root: string, branch: string) => Promise<Exclude<CatalogUpdate, 'updating'>>;
	read?: (system: ConnectedDesignSystem, update: CatalogUpdate) => Promise<Catalog>;
}

/**
 * The tab's design systems: connecting one, and reading the one shown. The first ask answers at once with what the clone
 * has and starts one fetch; an ask with `refresh` waits for the fetch that is running, or starts one, and answers with its
 * outcome. One fetch at a time per clone and branch.
 */
export class DesignLibrary {
	private fetching = new Map<string, Promise<Exclude<CatalogUpdate, 'updating'>>>();
	/** The last fetch's outcome for each clone and branch, so a later ask without `refresh` says how current the list is. */
	private outcome = new Map<string, Exclude<CatalogUpdate, 'updating'>>();
	/** What a repository with several design systems had found, until one is chosen: only a folder offered can be. */
	private offered = new Map<string, { root: string; branch: string; found: FoundDesignSystem[] }>();

	constructor(private readonly deps: DesignLibraryDeps) {}

	/** The one shown; `none` when none is connected, `lost` when its clone is gone from this computer. */
	current(): ConnectedDesignSystem | 'none' | 'lost' {
		const system = this.deps.systems.current();
		if (system === null) return 'none';
		return existsSync(system.root) ? system : 'lost';
	}

	async catalog(refresh: boolean): Promise<Catalog> {
		const system = this.current();
		if (system === 'none') return { state: 'none' };
		if (system === 'lost') {
			const gone = this.deps.systems.current() as ConnectedDesignSystem;
			return { state: 'lost', name: gone.name, root: gone.root };
		}
		const read = this.deps.read ?? readLibrary;
		if (refresh) return read(system, await this.fetch(system.root, system.branch));
		// Read before fetching: git runs one command at a time per repository, so the list waits for nothing.
		const last = this.outcome.get(`${system.root}#${system.branch}`);
		const now = await read(system, last ?? 'updating');
		if (last === undefined) void this.fetch(system.root, system.branch);
		return now;
	}

	/**
	 * Connects the design system in a repository's clone (decisions 23 to 25): its default branch brought up to date and
	 * looked in. Refused, in words, when it has none; connected and shown when it has one; offered when it has several.
	 */
	async connect(repository: string, root: string): Promise<DesignSystemConnection> {
		const branch = await defaultBranch(root);
		if (branch === null) throw new Error(`GitHub did not say which branch of ${repository} is its default, so it cannot be read.`);
		const update = await this.fetch(root, branch);
		const commit = await libraryCommit(root, branch);
		if (commit === null) throw new Error(typeof update === 'object' ? update.failed : `${repository} has no ${branch} branch from GitHub to read.`);
		const found = await findDesignSystems(libraryReads(root, commit), repository);
		if (found.length === 0) {
			throw new Error(`No design system was found in ${repository}: it has no Storybook stories, and no tokens in theme files, CSS variables or token files.`);
		}
		if (found.length > 1) {
			this.offered.set(repository, { root, branch, found });
			return { state: 'choose', repository, found };
		}
		return this.keep(repository, root, branch, found[0] as FoundDesignSystem);
	}

	/** Connects one of the design systems `connect` offered for a repository, by its folder; refused for any other. */
	choose(repository: string, folder: string): DesignSystemConnection {
		const at = this.offered.get(repository);
		const found = at?.found.find((f) => f.folder === folder);
		if (!at || !found) throw new Error('That is not one of the design systems found in the repository. Connect it again.');
		return this.keep(repository, at.root, at.branch, found);
	}

	private keep(repository: string, root: string, branch: string, found: FoundDesignSystem): DesignSystemConnection {
		const id = designSystemId(repository, found.folder);
		this.deps.systems.add({ id, name: found.name, repository, root, folder: found.folder, branch });
		this.offered.delete(repository);
		return { state: 'connected', id };
	}

	private fetch(root: string, branch: string): Promise<Exclude<CatalogUpdate, 'updating'>> {
		const key = `${root}#${branch}`;
		const running = this.fetching.get(key);
		if (running) return running;
		const update = this.deps.update ?? updateLibrary;
		const started = update(root, branch).then((outcome) => {
			this.outcome.set(key, outcome);
			this.fetching.delete(key);
			return outcome;
		});
		this.fetching.set(key, started);
		return started;
	}
}
