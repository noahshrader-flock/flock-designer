import { existsSync } from 'node:fs';
import { basename, isAbsolute, join } from 'node:path';
import { DESIGN_REPO } from '../../../shared/config';
import { type RepoRef, formatRepo, repoRefOf } from '../../../shared/repoRef';
import { type JsonFile, jsonFile } from '../platform/jsonFile';
import { readDescriptor } from './descriptor';
import { GUIDE } from '../prototypes/prototype';
import { PROTOTYPES_DIR } from '../../../shared/designPaths';
import { errorText } from '../../../shared/result';

/**
 * The design repository a product belongs to: what its workspace file names, else Flock's, as every product's was. Throws
 * the file's own error when it cannot be read: a product is never given another company's repository by a guess.
 */
export const designRepositoryOf = (productRoot: string): RepoRef => {
	const named = readDescriptor(productRoot).designRepository;
	return named === undefined ? DESIGN_REPO : repoRefOf(named);
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
 * Where a product's design records live: its design repository's `prototypes`, in the clone the person picked for it, else
 * the clone beside the product, named as the repository is. Null when neither is there, which DSNR says
 * (`designRepositoryMissing`) rather than making a folder outside any repository.
 */
export const recordsRootFor = (
	productRoot: string,
	{ clones = NO_CLONES, exists = existsSync }: { clones?: Pick<DesignRepositoryClones, 'at'>; exists?: (p: string) => boolean } = {},
): string | null => {
	let repo: RepoRef;
	try {
		repo = designRepositoryOf(productRoot);
	} catch {
		// Its workspace file cannot be read, so which repository it belongs to cannot be told: none is found.
		return null;
	}
	const found = [clones.at(formatRepo(repo)), join(productRoot, '..', repo.repo)].find(
		(dir): dir is string => dir !== null && exists(join(dir, '.git')),
	);
	return found === undefined ? null : join(found, PROTOTYPES_DIR);
};

/** Said when `recordsRootFor` finds nothing: which repository, and the two ways to give it. */
export const designRepositoryMissing = (productRoot: string): string => {
	const product = basename(productRoot);
	try {
		return `DSNR could not find ${formatRepo(designRepositoryOf(productRoot))}, the design repository ${product} belongs to. Clone it beside ${product}, or run DSNR: Locate the design repository.`;
	} catch (err) {
		return `Which design repository ${product} belongs to cannot be told: ${errorText(err)}`;
	}
};

/**
 * A folder that is a design repository: a git repository with the agent guide every task begins with (`GUIDE`), which a
 * product does not have. A product's own `prototypes` folder (an Angular workspace's) is not one.
 */
export const isDesignRepository = (dir: string): boolean => existsSync(join(dir, '.git')) && existsSync(join(dir, GUIDE));

/** Said when a folder picked as a design repository is not one (`isDesignRepository`). */
export const notADesignRepository = (dir: string): string =>
	`${dir} is not a design repository: it is not a git repository with ${GUIDE}, which every design repository has.`;
