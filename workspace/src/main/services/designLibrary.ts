import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { designSystemOf, isTokenGroup } from '../../shared/catalog';
import type { DeclaredTarget } from '../../shared/wcag';
import type { Catalog, CatalogComponent, CatalogUpdate, ConnectedDesignSystem, DesignTokens } from '../../shared/contract';
import { LIBRARY_MANIFEST, declaredTarget } from './accessibilityBrief';
import { isStoryFile, readCatalog, type CatalogReads } from './componentCatalog';
import { readTokens } from './designTokens';
import { type DesignSystemsMemory, filesOf, within } from './designSystems';
import { git } from './git';
import { singleFlight } from './concurrency';
import { errorText } from '../../shared/result';
import { CLI, HOST } from '../../shared/vocabulary';

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
const branchRef = (branch: string): string => `refs/remotes/origin/${branch}`;

/** What git said when a fetch of `branch` failed, in words a person can act on. */
export const fetchProblem = (stderr: string, branch: string): string => {
	if (
		/Authentication failed|could not read (Username|Password)|terminal prompts disabled|Repository not found|Permission denied \(publickey\)|403/i.test(
			stderr,
		)
	) {
		return `${HOST} would not let git on this computer read the library: git is not signed in to ${HOST}, or this account cannot read it. Run \`${CLI} auth setup-git\` in a terminal (with ${HOST}'s command line signed in), or sign in to git.`;
	}
	if (
		/Could not resolve host|Failed to connect|Connection (timed out|refused|reset)|Network is unreachable|unable to access|timed out|SIGTERM/i.test(
			stderr,
		)
	) {
		return `Could not reach ${HOST}. Check the internet connection.`;
	}
	if (/couldn't find remote ref|no such ref/i.test(stderr)) return `${HOST} has no ${branch} branch for the library.`;
	const said =
		stderr
			.trim()
			.split('\n')
			.pop()
			?.replace(/^fatal:\s*/, '') ?? '';
	return `Git could not update the library: ${said || 'it stopped without saying why.'}`;
};

/** The commit a clone's copy of `branch` is at, or null when it has none. */
export const libraryCommit = async (root: string, branch: string): Promise<string | null> => {
	try {
		return (await git(root, ['rev-parse', '--verify', '--quiet', `${branchRef(branch)}^{commit}`])) || null;
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
		await git(root, ['fetch', '--quiet', '--no-tags', '--no-recurse-submodules', 'origin', `+refs/heads/${branch}:${branchRef(branch)}`], {
			timeoutMs: FETCH_TIMEOUT_MS,
		});
	} catch (err) {
		return { failed: fetchProblem(errorText(err), branch) };
	}
	return (await libraryCommit(root, branch)) === before ? 'unchanged' : 'updated';
};

/**
 * The library's two reads, for the catalog and the tokens, on `ref` (a commit, or the copy of a branch) through git.
 * Listing also reads every story it lists with one `git cat-file --batch`, so the files the catalog asks for next are
 * already here: one git process for eighty stories, not eighty. A file not read that way is read on its own. A package's
 * file, which is never in git, is read where the clone has it installed, as the previews are built with it (a theme a
 * stylesheet imports, Phase 5.5).
 */
export const libraryReads = (root: string, ref: string): CatalogReads => {
	const read = new Map<string, Promise<Map<string, string>>>();
	const readStories = async (paths: string[]): Promise<Map<string, string>> => {
		// A header no story can contain, then the object as git stores it; `%(rest)` gives back the path asked for.
		const mark = `@@dsnr-${Math.random().toString(36).slice(2)}@@`;
		const out = await git(root, ['cat-file', `--batch=${mark} %(objecttype) %(rest)`], {
			input: paths.map((p) => `${ref}:${p} ${p}\n`).join(''),
			trim: false,
		});
		const files = new Map<string, string>();
		// Git ends each object with one newline of its own: the next header's split takes it, and the last is taken here,
		// so every file is exactly as committed.
		for (const chunk of `\n${out.replace(/\n$/, '')}`.split(`\n${mark} `).slice(1)) {
			const newline = chunk.indexOf('\n');
			const [type, path] = [chunk.slice(0, chunk.indexOf(' ')), chunk.slice(chunk.indexOf(' ') + 1, newline)];
			if (type === 'blob') files.set(path, chunk.slice(newline + 1));
		}
		return files;
	};
	// A folder is listed once: the catalog and the tokens both list the whole library, from the same commit.
	const listed = new Map<string, Promise<string[]>>();
	const list = async (dir: string): Promise<string[]> => {
		const files = (await git(root, ['ls-tree', '-r', '--name-only', ref, ...(dir === '' ? [] : ['--', dir])])).split('\n').filter(Boolean);
		const stories = files.filter((f) => isStoryFile(f) && !/\s/.test(f));
		if (stories.length > 0)
			read.set(
				dir,
				readStories(stories).catch(() => new Map()),
			);
		return files;
	};
	return {
		listFiles: (dir) => listed.get(dir) ?? listed.set(dir, list(dir)).get(dir)!,
		readFile: async (path) => {
			if (/(^|\/)node_modules\//.test(path)) return readFile(join(root, path), 'utf8');
			for (const batch of read.values()) {
				const text = (await batch).get(path);
				if (text !== undefined) return text;
			}
			return git(root, ['show', `${ref}:${path}`], { trim: false });
		},
	};
};

/** The design system's own reads: its package of the repository (decision 25), at `commit`. */
export const systemReads = async (system: ConnectedDesignSystem, commit: string): Promise<CatalogReads> => {
	const all = libraryReads(system.root, commit);
	return within(all, filesOf(await all.listFiles(''), system.folder));
};

/**
 * The components the tab lists: the library's own token pages leave the list only when the panel has the tokens to show
 * instead (decision 22). The one rule, for the list and for what is drawn to find each component's tokens (T6).
 */
export const listedComponents = (components: CatalogComponent[], tokens: DesignTokens): CatalogComponent[] =>
	tokens.source !== null ? components.filter((c) => !isTokenGroup(c.group)) : components;

/** A design system's accessibility target (T7): what its own manifest declares on the commit read, or the default. */
export const libraryTarget = async (reads: CatalogReads, name: string): Promise<DeclaredTarget> =>
	declaredTarget(await reads.readFile(LIBRARY_MANIFEST).catch(() => null), name);

/** The catalog as the clone's copy of the design system's branch has it now, with `update` as given. */
export const readLibrary = async (system: ConnectedDesignSystem, update: CatalogUpdate): Promise<Catalog> => {
	const { root, branch } = system;
	const commit = await libraryCommit(root, branch);
	if (commit === null) return { state: 'no-branch', root, branch };
	const committedAt = await git(root, ['log', '-1', '--format=%cI', commit]);
	// The components and the tokens, from the same reads of the same commit.
	const reads = await systemReads(system, commit);
	// With its accessibility target (T7), as its own manifest declares it on the same commit.
	const [components, tokens, accessibility] = await Promise.all([
		readCatalog(reads, designSystemOf(system)),
		readTokens(reads),
		libraryTarget(reads, system.name),
	]);
	return { state: 'ready', branch, commit, committedAt, update, components: listedComponents(components, tokens), tokens, accessibility };
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
	/** One fetch of a library's branch at a time, shared, and forgotten once it settles (a failed one included). */
	private fetching = singleFlight<string, Exclude<CatalogUpdate, 'updating'>>();
	/** The last fetch's outcome for each clone and branch, so a later ask without `refresh` says how current the list is. */
	private outcome = new Map<string, Exclude<CatalogUpdate, 'updating'>>();

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

	private fetch(root: string, branch: string): Promise<Exclude<CatalogUpdate, 'updating'>> {
		const key = `${root}#${branch}`;
		const update = this.deps.update ?? updateLibrary;
		return this.fetching.run(key, () =>
			update(root, branch).then((outcome) => {
				this.outcome.set(key, outcome);
				return outcome;
			}),
		);
	}
}
