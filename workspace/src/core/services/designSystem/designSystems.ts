/** A repository is accepted as a design system by what is in it (Storybook stories or tokens), never by its name. */
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import type { ConnectedDesignSystem, ConnectedDesignSystems, FoundDesignSystem } from '../../../shared/contract';
import { asArray, asRecord } from '../../../shared/json';
import { storybookAddress } from '../../../shared/catalog';
import { SCRIPT_EXTENSIONS, isStoryFile, type CatalogReads } from './componentCatalog';
import { packageFirst } from './storybookSetup';
import { readTokens } from './designTokens';
import { folderReads } from './folderReads';
import { defaultBranch, git } from '../platform/git';
import { type JsonFile, jsonFile } from '../platform/jsonFile';
import { repositoryAt } from '../projects/repositories';
import { asRepositoryPath, repoName } from '../../../shared/repoRef';

export const designSystemId = (repository: string, folder: string): string => (folder === '' ? repository : `${repository}:${folder}`);

/** Deepest first, which `packageOf` relies on to find a file's own package. */
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

const packageOf = (file: string, packages: string[]): string => packages.find((p) => p === '' || file.startsWith(`${p}/`)) ?? '';

/** Not those in a package nested inside it. */
export const filesOf = (files: string[], folder: string): string[] => {
	const packages = packagesOf(files);
	return files.filter((f) => packageOf(f, packages) === folder);
};

/** So one package's catalog and tokens are read as if it were the whole repository. */
export const within = (reads: CatalogReads, files: string[]): CatalogReads => ({
	listFiles: async (dir) => files.filter((f) => dir === '' || f.startsWith(`${dir}/`)),
	readFile: (path) => reads.readFile(path),
});

const packageName = async (reads: CatalogReads, folder: string): Promise<string | null> => {
	const text = await reads.readFile(folder === '' ? 'package.json' : `${folder}/package.json`).catch(() => null);
	try {
		const name = text === null ? null : (JSON.parse(text) as { name?: unknown }).name;
		return typeof name === 'string' && name !== '' ? name.replace(/^@[^/]+\//, '') : null;
	} catch {
		return null;
	}
};

export const nameOf = async (reads: CatalogReads, files: string[], repository: string, folder: string): Promise<string> => {
	for (const dir of packageFirst(folder).map((at) => (at === '' ? '.storybook/' : `${at}/.storybook/`))) {
		for (const file of files.filter((f) => f.startsWith(dir) && SCRIPT_EXTENSIONS.some((e) => f.endsWith(`.${e}`)))) {
			const text = await reads.readFile(file).catch(() => '');
			const title = /\bbrandTitle\s*:\s*(['"])([^'"]+)\1/.exec(text)?.[2];
			if (title) return title;
		}
	}
	return (await packageName(reads, folder)) ?? repoName(repository);
};

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

/** It is read from its default branch as git has it from GitHub, so a folder that is not a clone of one there throws. */
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

const parseConnected = (raw: unknown): ConnectedDesignSystems => {
	const kept = asRecord(raw);
	const systems = asArray(kept.systems).filter((s): s is ConnectedDesignSystem => {
		const r = asRecord(s);
		const strings = [r.id, r.name, r.root, r.folder, r.branch].every((v) => typeof v === 'string');
		const storybook = r.storybook === undefined || (typeof r.storybook === 'string' && storybookAddress(r.storybook) === r.storybook);
		return strings && storybook && asRepositoryPath(r.repository) !== null && isAbsolute(r.root as string);
	});
	const current = typeof kept.current === 'string' && systems.some((s) => s.id === kept.current) ? kept.current : (systems[0]?.id ?? null);
	return { systems, current };
};

/** What is kept is a hint: whoever reads it checks the folder is still there. */
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

	current(): ConnectedDesignSystem | null {
		const { systems, current } = this.read();
		return systems.find((s) => s.id === current) ?? null;
	}

	/** A Storybook address given for it before is kept: its files, read again, do not say it. */
	add(system: ConnectedDesignSystem): void {
		const { systems } = this.read();
		const storybook = system.storybook ?? systems.find((s) => s.id === system.id)?.storybook;
		this.write([...systems.filter((s) => s.id !== system.id), { ...system, ...(storybook ? { storybook } : {}) }], system.id);
	}

	/** `address` is a web address (`storybookAddress`'s): kept with the design system, as its files do not say it. */
	setStorybook(id: string, address: string): void {
		const { systems, current } = this.read();
		this.write(
			systems.map((s) => (s.id === id ? { ...s, storybook: address } : s)),
			current,
		);
	}
}
