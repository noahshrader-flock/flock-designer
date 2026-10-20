import { existsSync, statSync } from 'node:fs';
import { basename, isAbsolute, join } from 'node:path';
import { DESIGN_REPO } from '../../../shared/config';
import { type RepoRef, formatRepo, repoRefOf } from '../../../shared/repoRef';
import { type JsonFile, jsonFile } from '../platform/jsonFile';
import { readDescriptor } from './descriptor';

/** The design repository a product belongs to: what its workspace file names, else Flock's, as every product's was. */
export const designRepositoryOf = (productRoot: string): RepoRef => {
	try {
		const named = readDescriptor(productRoot).designRepository;
		return named === undefined ? DESIGN_REPO : repoRefOf(named);
	} catch {
		return DESIGN_REPO;
	}
};

/**
 * Where the person keeps a design repository's clone on this machine, by `owner/repo`, when it is not beside the product:
 * clone paths are each person's, so a product's file cannot say. What is kept is a hint: whoever reads it checks it is there.
 */
export class DesignRepositoryClones {
	private readonly file: JsonFile<Record<string, string>>;

	constructor(path: string) {
		this.file = jsonFile(path, {
			parse: (raw) =>
				Object.fromEntries(
					Object.entries(typeof raw === 'object' && raw !== null ? raw : {}).filter(
						(e): e is [string, string] => typeof e[1] === 'string' && isAbsolute(e[1]),
					),
				),
			fallback: {},
		});
	}

	at(repository: string): string | null {
		return this.file.read()[repository] ?? null;
	}

	set(repository: string, dir: string): void {
		this.file.write({ ...this.file.read(), [repository]: dir });
	}
}

/** None kept: only the clone beside the product is looked for. */
export const NO_CLONES: Pick<DesignRepositoryClones, 'at'> = { at: () => null };

/**
 * Where a product's design records live: its design repository's `projects`, in the clone the person picked for it, else
 * the clone beside the product, named as the repository is. Null when neither is there, which DSNR says
 * (`designRepositoryMissing`) rather than making a folder outside any repository.
 */
export const recordsRootFor = (
	productRoot: string,
	{ clones = NO_CLONES, exists = existsSync }: { clones?: Pick<DesignRepositoryClones, 'at'>; exists?: (p: string) => boolean } = {},
): string | null => {
	const repo = designRepositoryOf(productRoot);
	const found = [clones.at(formatRepo(repo)), join(productRoot, '..', repo.repo)].find(
		(dir): dir is string => dir !== null && exists(join(dir, '.git')),
	);
	return found === undefined ? null : join(found, 'projects');
};

/** Said when `recordsRootFor` finds nothing: which repository, and the two ways to give it. */
export const designRepositoryMissing = (productRoot: string): string =>
	`DSNR could not find ${formatRepo(designRepositoryOf(productRoot))}, the design repository ${basename(productRoot)} belongs to. Clone it beside ${basename(productRoot)}, or run DSNR: Locate the design repository.`;

const isFolder = (p: string): boolean => existsSync(p) && statSync(p).isDirectory();

/** A folder the person picks as one: a git repository with a design repository's own folders. Trusted beyond that. */
export const isDesignRepository = (dir: string): boolean =>
	existsSync(join(dir, '.git')) && (isFolder(join(dir, 'agents')) || isFolder(join(dir, 'projects')));
