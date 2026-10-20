import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, posix } from 'node:path';
import { designSystemOf, isTokenGroup } from '../../../shared/catalog';
import type { DeclaredTarget } from '../../../shared/wcag';
import type { Catalog, CatalogComponent, CatalogUpdate, ConnectedDesignSystem, DesignTokens } from '../../../shared/contract';
import { LIBRARY_MANIFEST, declaredTarget } from '../accessibility/accessibilityBrief';
import { isStoryFile, readCatalog, type CatalogReads } from './componentCatalog';
import { readTokens } from './designTokens';
import { type DesignSystemsMemory, filesOf, within } from './designSystems';
import { git, refTip } from '../platform/git';
import { fetchRemoteCopy } from '../platform/fetch';
import { singleFlight } from '../platform/concurrency';

/**
 * Read from git's copy of the branch on GitHub (`origin/<branch>`), never the folder, so what the clone has checked out
 * makes no difference. Nothing is checked out, and no code from the library is run.
 */

const FETCH_TIMEOUT_MS = 120_000;

const branchRef = (branch: string): string => `refs/remotes/origin/${branch}`;

export const libraryCommit = (root: string, branch: string): Promise<string | null> => refTip(root, branchRef(branch)).catch(() => null);

/** `showing` is the hand-over branch the commit is the tip of; null for the library's own branch. */
export type LibraryAt = (system: ConnectedDesignSystem) => Promise<{ commit: string; showing: string | null } | null>;

/** For anyone who must read the library's own branch even while a hand-over branch is shown. */
export const baseAt: LibraryAt = async (system) => {
	const commit = await libraryCommit(system.root, system.branch);
	return commit === null ? null : { commit, showing: null };
};

/** Only the library's copy of its branch moves (`fetchRemoteCopy`). Never throws; a failure is said in words. */
export const updateLibrary = async (root: string, branch: string): Promise<Exclude<CatalogUpdate, 'updating'>> => {
	const before = await libraryCommit(root, branch);
	const copy = { remote: 'origin', remoteRef: `refs/heads/${branch}`, trackingRef: branchRef(branch) };
	const failed = await fetchRemoteCopy(root, copy, { timeoutMs: FETCH_TIMEOUT_MS, what: 'the library', branch });
	if (failed !== null) return { failed };
	return (await libraryCommit(root, branch)) === before ? 'unchanged' : 'updated';
};

/** Throws for a path that leaves the clone (`..`, or absolute), as a stylesheet's import or a package's `style` could say. */
export const inLibrary = (path: string): string => {
	const normal = posix.normalize(path.replace(/\\/g, '/'));
	if (normal.startsWith('../') || normal === '..' || posix.isAbsolute(normal)) throw new Error(`${path} is not in the design system's repository.`);
	return normal;
};

/**
 * Listing reads every story it lists in one `git cat-file --batch`: one git process for eighty stories, not eighty. A
 * package's file, never in git, is read where the clone has it installed.
 */
export const libraryReads = (root: string, ref: string): CatalogReads => {
	const read = new Map<string, Promise<Map<string, string>>>();
	const readBatch = async (paths: string[]): Promise<Map<string, string>> => {
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
				readBatch(stories).catch(() => new Map()),
			);
		return files;
	};
	return {
		listFiles: (dir) => listed.get(dir) ?? listed.set(dir, list(dir)).get(dir)!,
		readFile: async (path) => {
			if (/(^|\/)node_modules\//.test(path)) return readFile(join(root, inLibrary(path)), 'utf8');
			for (const batch of read.values()) {
				const text = (await batch).get(path);
				if (text !== undefined) return text;
			}
			return git(root, ['show', `${ref}:${path}`], { trim: false });
		},
		readFiles: async (paths) => {
			const installed = paths.filter((p) => /(^|\/)node_modules\//.test(p));
			const committed = await readBatch(paths.filter((p) => !installed.includes(p)));
			for (const p of installed) {
				const text = await readFile(join(root, inLibrary(p)), 'utf8').catch(() => null);
				if (text !== null) committed.set(p, text);
			}
			return committed;
		},
	};
};

export const systemReads = async (system: ConnectedDesignSystem, commit: string): Promise<CatalogReads> => {
	const all = libraryReads(system.root, commit);
	return within(all, filesOf(await all.listFiles(''), system.folder));
};

/** Token pages leave the list only when the panel has the tokens to show instead; the one rule for the list and for drawing. */
export const listedComponents = (components: CatalogComponent[], tokens: DesignTokens): CatalogComponent[] =>
	tokens.source !== null ? components.filter((c) => !isTokenGroup(c.group)) : components;

export const libraryTarget = async (reads: CatalogReads, name: string): Promise<DeclaredTarget> =>
	declaredTarget(await reads.readFile(LIBRARY_MANIFEST).catch(() => null), name);

export const readLibrary = async (system: ConnectedDesignSystem, update: CatalogUpdate, at: LibraryAt = baseAt): Promise<Catalog> => {
	const { root, branch } = system;
	const shown = await at(system);
	if (shown === null) return { state: 'no-branch', root, branch };
	const { commit, showing } = shown;
	const committedAt = await git(root, ['log', '-1', '--format=%cI', commit]);
	const reads = await systemReads(system, commit);
	const [components, tokens, accessibility] = await Promise.all([
		readCatalog(reads, designSystemOf(system)),
		readTokens(reads),
		libraryTarget(reads, system.name),
	]);
	return { state: 'ready', branch, commit, showing, committedAt, update, components: listedComponents(components, tokens), tokens, accessibility };
};

export interface DesignLibraryDeps {
	/** Asked on every call, so one connected or switched since is used. */
	systems: DesignSystemsMemory;
	update?: (root: string, branch: string) => Promise<Exclude<CatalogUpdate, 'updating'>>;
	read?: (system: ConnectedDesignSystem, update: CatalogUpdate, at: LibraryAt) => Promise<Catalog>;
	at?: LibraryAt;
}

/**
 * The first ask answers at once with what the clone has and starts one fetch; an ask with `refresh` waits for the fetch
 * running, or starts one. One fetch at a time per clone and branch.
 */
export class DesignLibrary {
	/** Forgotten once it settles, a failed one included, so the next ask fetches again. */
	private fetching = singleFlight<string, Exclude<CatalogUpdate, 'updating'>>();
	private outcome = new Map<string, Exclude<CatalogUpdate, 'updating'>>();

	constructor(private readonly deps: DesignLibraryDeps) {}

	/** `lost` when its clone is gone from this computer. */
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
		const at = this.deps.at ?? baseAt;
		if (refresh) return read(system, await this.fetch(system.root, system.branch), at);
		// Read before fetching, so the list waits for nothing.
		const last = this.outcome.get(`${system.root}#${system.branch}`);
		const now = await read(system, last ?? 'updating', at);
		if (last === undefined) void this.fetch(system.root, system.branch);
		return now;
	}

	update(system: ConnectedDesignSystem): Promise<Exclude<CatalogUpdate, 'updating'>> {
		return this.fetch(system.root, system.branch);
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
