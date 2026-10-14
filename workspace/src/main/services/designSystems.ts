/**
 * The design systems a person connected, for the Design System tab (P4 of the design system plan): any repository they
 * can reach, **accepted by what is found in it, not by its name** (decision 23). A design system is a folder with
 * Storybook stories or tokens (decision 25): in a repository of one, its root; in a monorepo, the package that has them,
 * and when several do, the person chooses. Its branch is the repository's default (decision 24). Several can be
 * connected, one shown at a time, and each is remembered.
 */
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import type { ConnectedDesignSystem, ConnectedDesignSystems, FoundDesignSystem } from '../../shared/contract';
import { asArray, asRecord } from '../../shared/json';
import { isStoryFile, type CatalogReads } from './componentCatalog';
import { readTokens } from './designTokens';
import { folderReads } from './folderReads';
import { git } from './git';
import { type JsonFile, jsonFile } from './jsonFile';
import { repositoryAt } from './repositories';
import { asRepositoryPath, repoName } from '../../shared/repoRef';
const REMOTE_TIMEOUT_MS = 30_000;

/** A design system's id: its repository, and in a monorepo the folder it is in. */
export const designSystemId = (repository: string, folder: string): string => (folder === '' ? repository : `${repository}:${folder}`);

/** The folders of a repository that are packages (have a `package.json`), and its root, deepest first. */
const packagesOf = (files: string[]): string[] =>
	[
		'',
		...files
			.filter((f) => f === 'package.json' || f.endsWith('/package.json'))
			.map((f) => dirname(f))
			.filter((d) => d !== '.'),
	]
		.filter((d, i, all) => all.indexOf(d) === i)
		.sort((a, b) => b.length - a.length);

/** The package a file belongs to: the deepest one whose folder it is in. */
const packageOf = (file: string, packages: string[]): string => packages.find((p) => p === '' || file.startsWith(`${p}/`)) ?? '';

/** The files of a repository that are a package's own: in its folder, and not in a package inside it. */
export const filesOf = (files: string[], folder: string): string[] => {
	const packages = packagesOf(files);
	return files.filter((f) => packageOf(f, packages) === folder);
};

/** The same reads, seeing only `files`: the catalog and the tokens of one package read as if it were the repository. */
export const within = (reads: CatalogReads, files: string[]): CatalogReads => ({
	listFiles: async (dir) => files.filter((f) => dir === '' || f.startsWith(`${dir}/`)),
	readFile: (path) => reads.readFile(path),
});

/** A package's own name, without its scope (`@acme/ui` is `ui`), or null. */
const packageName = async (reads: CatalogReads, folder: string): Promise<string | null> => {
	const text = await reads.readFile(folder === '' ? 'package.json' : `${folder}/package.json`).catch(() => null);
	try {
		const name = text === null ? null : (JSON.parse(text) as { name?: unknown }).name;
		return typeof name === 'string' && name !== '' ? name.replace(/^@[^/]+\//, '') : null;
	} catch {
		return null;
	}
};

/** What a design system is called: its Storybook's brand title (its own, then the repository's), its package's name, or the repository's. */
export const nameOf = async (reads: CatalogReads, files: string[], repository: string, folder: string): Promise<string> => {
	const storybooks = [folder === '' ? '.storybook/' : `${folder}/.storybook/`, '.storybook/'];
	for (const dir of storybooks) {
		for (const file of files.filter((f) => f.startsWith(dir) && /\.(ts|tsx|js|jsx|mjs)$/.test(f))) {
			const text = await reads.readFile(file).catch(() => '');
			const title = /\bbrandTitle\s*:\s*(['"])([^'"]+)\1/.exec(text)?.[2];
			if (title) return title;
		}
	}
	return (await packageName(reads, folder)) ?? repoName(repository);
};

/**
 * Where in a repository its design systems are (decision 25): each package with Storybook stories or tokens of its own,
 * with how many of each and what it is called. None is a repository with no design system in it.
 */
export const findDesignSystems = async (reads: CatalogReads, repository: string): Promise<FoundDesignSystem[]> => {
	const files = await reads.listFiles('');
	const found: FoundDesignSystem[] = [];
	for (const folder of packagesOf(files)) {
		const own = filesOf(files, folder);
		const components = own.filter(isStoryFile).length;
		const tokens = (await readTokens(within(reads, own))).tokens.length;
		if (components === 0 && tokens === 0) continue;
		found.push({ folder, components, tokens, name: await nameOf(reads, files, repository, folder) });
	}
	// The root first, then by folder, so the choice reads the same every time.
	return found.sort((a, b) => a.folder.localeCompare(b.folder));
};

/** The branch GitHub calls a clone's repository's default: git's own record of it, else asked of GitHub; null if neither says. */
export const defaultBranch = async (root: string): Promise<string | null> => {
	try {
		const ref = await git(root, ['symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD']);
		if (ref.startsWith('refs/remotes/origin/')) return ref.slice('refs/remotes/origin/'.length);
	} catch {
		// A clone made without it, or an old one: asked of GitHub instead.
	}
	try {
		const out = await git(root, ['ls-remote', '--symref', 'origin', 'HEAD'], { timeoutMs: REMOTE_TIMEOUT_MS });
		return /^ref: refs\/heads\/(\S+)\s+HEAD$/m.exec(out)?.[1] ?? null;
	} catch {
		return null;
	}
};

/**
 * The design system in a folder found on this machine (VS Code, ELECTRON_MIGRATION_PLAN §1.6), as connecting it would
 * keep it: its repository on GitHub, the folder in it, the repository's default branch, and its name. What is read is
 * that branch as git has it from GitHub, as for one connected, so a folder that is not a clone of a repository there
 * cannot be read, and says why.
 */
export const systemAt = async (root: string): Promise<ConnectedDesignSystem> => {
	let up: string;
	try {
		up = await git(root, ['rev-parse', '--show-cdup']);
	} catch {
		throw new Error(`${root} is not a git repository. The design system is read from its branch on GitHub, so open a clone of it.`);
	}
	// The repository's top, written as the folder was (not git's real path, which differs on macOS's /var).
	const top = up === '' ? root : resolve(root, up);
	const repository = repositoryAt(top);
	if (repository === null)
		throw new Error(`${root} is not a clone of a repository on GitHub (it has no origin there), so its branch on GitHub cannot be read.`);
	const folder = relative(top, root).split(sep).join('/');
	const branch = await defaultBranch(top);
	if (branch === null) throw new Error(`GitHub did not say which branch of ${repository} is its default, so it cannot be read.`);
	const reads = folderReads(top);
	const name = await nameOf(reads, await reads.listFiles(''), repository, folder);
	return { id: designSystemId(repository, folder), name, repository, root: top, folder, branch };
};

/**
 * What the file holds, checked: only whole design systems, and a current one among them. A file kept by an earlier
 * version (one connected folder, `{ "folder": … }`) is read as that one design system: that version took only FUI,
 * whose branch is `develop`.
 */
const parseConnected = (raw: unknown): ConnectedDesignSystems => {
	const kept = asRecord(raw);
	if (typeof kept.folder === 'string' && isAbsolute(kept.folder) && kept.systems === undefined) {
		const repository = repositoryAt(kept.folder);
		if (repository === null) return { systems: [], current: null };
		const id = designSystemId(repository, '');
		return { systems: [{ id, name: repoName(repository), repository, root: kept.folder, folder: '', branch: 'develop' }], current: id };
	}
	const systems = asArray(kept.systems).filter((s): s is ConnectedDesignSystem => {
		const r = asRecord(s);
		const strings = [r.id, r.name, r.root, r.folder, r.branch].every((v) => typeof v === 'string');
		// Its repository is read as every kept one is (a record's too): the path of one, or not a design system.
		return strings && asRepositoryPath(r.repository) !== null && isAbsolute(r.root as string);
	});
	const current = typeof kept.current === 'string' && systems.some((s) => s.id === kept.current) ? kept.current : (systems[0]?.id ?? null);
	return { systems, current };
};

/**
 * The design systems a person connected, and which is shown, in their own small file in the app's settings. What is kept
 * is a hint: whoever reads it checks the folder is still there.
 */
export class DesignSystemsMemory {
	private readonly file: JsonFile<ConnectedDesignSystems>;

	constructor(path: string) {
		this.file = jsonFile(path, { parse: parseConnected, fallback: { systems: [], current: null } });
	}

	read(): ConnectedDesignSystems {
		return this.file.read();
	}

	/** Not remembering is an inconvenience: the person connects it again. */
	private write(systems: ConnectedDesignSystem[], current: string | null): void {
		this.file.write({ systems, current });
	}

	/** The one shown, or null when none is connected. */
	current(): ConnectedDesignSystem | null {
		const { systems, current } = this.read();
		return systems.find((s) => s.id === current) ?? null;
	}

	/** Connects one, or updates the one with its id, and shows it. */
	add(system: ConnectedDesignSystem): void {
		const { systems } = this.read();
		this.write([...systems.filter((s) => s.id !== system.id), system], system.id);
	}

	/** Shows another of those connected; nothing happens for one that is not. */
	select(id: string): void {
		const { systems } = this.read();
		if (systems.some((s) => s.id === id)) this.write(systems, id);
	}

	/** Removes one: the next is shown, or none. Nothing on disk is deleted, only the connection. */
	remove(id: string): void {
		const { systems, current } = this.read();
		const left = systems.filter((s) => s.id !== id);
		this.write(left, current === id ? (left[0]?.id ?? null) : current);
	}
}
