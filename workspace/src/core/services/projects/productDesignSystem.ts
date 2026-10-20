import { type Dirent, existsSync, readdirSync, statSync } from 'node:fs';
import { basename, isAbsolute, join, relative } from 'node:path';
import { asRepositoryPath, parseRemote } from '../../../shared/repoRef';
import { findDesignSystems } from '../designSystem/designSystems';
import { folderReads } from '../designSystem/folderReads';
import { type JsonFile, jsonFile, readJsonObject } from '../platform/jsonFile';
import { installedPackage } from '../prototypes/installedVersion';
import { claimedRepository, git, isSafeBranchName, refTip } from '../platform/git';
import { isInside } from '../platform/paths';
import { GENERATED_FOLDERS } from '../../../shared/generatedFolders';
import { type WorkspaceDescriptor, designSystemCheckout, readDescriptor } from './descriptor';

const isFolder = (p: string): boolean => existsSync(p) && statSync(p).isDirectory();

/**
 * The design system in `dir`, as the Design System tab would read it: the folder itself, or one inside a monorepo; with
 * `exactly`, the folder itself only, as a package already found where it is.
 */
export const designSystemIn = async (dir: string, { exactly = false }: { exactly?: boolean } = {}): Promise<string | null> => {
	if (!isFolder(dir)) return null;
	const found = await findDesignSystems(folderReads(dir), basename(dir)).catch(() => []);
	const first = exactly ? found.find((f) => f.folder === '') : found[0];
	return first === undefined ? null : first.folder === '' ? dir : join(dir, first.folder);
};

/** Every package of the repositories measured (Primer's monorepo among them) is within 4 folders of its root. */
const PACKAGE_DEPTH = 4;
const NOT_PACKAGES = new Set<string>(GENERATED_FOLDERS);

/**
 * The folder of the package named `pkg` in the repository at `root` (`''` for the root's own), the shallowest first; null
 * for none. Only package.json names decide it, never what a folder holds; generated and hidden folders are not looked in, so
 * an installed copy in `node_modules` is never taken for the source.
 */
export const packageFolderNamed = (root: string, pkg: string): string | null => {
	let level = [''];
	for (let depth = 0; depth <= PACKAGE_DEPTH && level.length > 0; depth++) {
		const next: string[] = [];
		for (const folder of level) {
			let entries: Dirent[];
			try {
				entries = readdirSync(join(root, folder), { withFileTypes: true });
			} catch {
				continue;
			}
			if (entries.some((e) => e.isFile() && e.name === 'package.json') && readJsonObject(join(root, folder, 'package.json'))?.name === pkg)
				return folder;
			for (const e of entries)
				if (e.isDirectory() && !e.name.startsWith('.') && !NOT_PACKAGES.has(e.name)) next.push(folder === '' ? e.name : `${folder}/${e.name}`);
		}
		level = next.sort();
	}
	return null;
};

/**
 * Where the product's design system is: in its own repository, as the workspace file's folder says or as the package of the
 * name it gives; else its own repository, beside the product.
 */
const placeOf = (productRoot: string, designSystem: WorkspaceDescriptor['designSystem']): { dir: string; inProduct: boolean } => {
	const folder = designSystem.folder ?? packageFolderNamed(productRoot, designSystem.package);
	return folder === null
		? { dir: designSystemCheckout(productRoot, designSystem), inProduct: false }
		: { dir: designSystemCheckout(productRoot, { ...designSystem, folder }), inProduct: true };
};

/**
 * The design system the person chose for a product, in place of the one it names: kept in the product clone's own git
 * config, so it is on this machine only, never committed, and read from the product's folder alone, by the app and the
 * `dsnr` command alike.
 */
const CHOICE = 'dsnr.designSystem';

/** The folder chosen for the product, or null when none is. */
export const chosenDesignSystem = async (productRoot: string): Promise<string | null> => {
	const at = await git(productRoot, ['config', '--local', '--get', CHOICE]).catch(() => '');
	return isAbsolute(at) ? at : null;
};

/**
 * Chooses `dir` as the product's design system, or, with null, goes back to the one it names. A folder that holds none
 * is refused, and what was chosen before stays.
 */
export const chooseDesignSystem = async (productRoot: string, dir: string | null): Promise<void> => {
	if (dir === null) {
		// Nothing to unset is not a failure: the product's own is in use already.
		await git(productRoot, ['config', '--local', '--unset', CHOICE]).catch(() => undefined);
		return;
	}
	if (!isAbsolute(dir) || (await designSystemIn(dir)) === null)
		throw new Error(`${dir} holds no design system: no Storybook stories and no tokens were found in it.`);
	await git(productRoot, ['config', '--local', CHOICE, dir]);
};

/**
 * Whether the design system in use for the product is in its own repository (the folder chosen, else where it names it),
 * so its component changes and its codebase work share the one checkout. False when that cannot be told.
 */
export const holdsItsDesignSystem = async (productRoot: string): Promise<boolean> => {
	const chosen = await chosenDesignSystem(productRoot);
	if (chosen !== null) return isInside(productRoot, chosen);
	try {
		return placeOf(productRoot, readDescriptor(productRoot).designSystem).inProduct;
	} catch {
		return false;
	}
};

/** `owner/repo` from a package.json's `repository`, in any of the forms npm takes; null for none, or another host. */
export const packageRepository = (field: unknown): string | null => {
	const raw = typeof field === 'string' ? field : typeof field === 'object' && field !== null ? (field as { url?: unknown }).url : null;
	if (typeof raw !== 'string') return null;
	const url = raw.trim().replace(/^git\+/, '');
	if (url.startsWith('github:')) return asRepositoryPath(url.slice('github:'.length));
	return asRepositoryPath(url) ?? parseRemote(url);
};

/**
 * Whether `dir` is the source of the package `pkg` the product has installed, read from package.json and git only: the same
 * name, the installed package's repository the clone's `origin`, and a release tag for the installed version. One that differs
 * is a mismatch; one that cannot be read leaves it unconfirmed, saying which. With nothing installed it is used as named.
 */
export type SourceCheck =
	{ state: 'confirmed' } | { state: 'uninstalled' } | { state: 'unconfirmed'; why: string; key: string } | { state: 'mismatch'; why: string };

/** The folder as the person reads it, from the product: `../ui`. */
const labelOf = (productRoot: string, dir: string): string => relative(productRoot, dir) || dir;

/** Its package.json names `pkg`; else a mismatch, in words. */
const checkName = (productRoot: string, pkg: string, dir: string): SourceCheck => {
	const name = readJsonObject(join(dir, 'package.json'))?.name;
	return name === pkg
		? { state: 'confirmed' }
		: {
				state: 'mismatch',
				why: `${labelOf(productRoot, dir)} is not ${pkg}'s source: its package is ${typeof name === 'string' ? name : 'unnamed'}.`,
			};
};

export const checkSource = async (productRoot: string, pkg: string, dir: string): Promise<SourceCheck> => {
	const label = labelOf(productRoot, dir);
	const named = checkName(productRoot, pkg, dir);
	if (named.state === 'mismatch') return named;
	const installed = installedPackage(join(productRoot, 'node_modules'), pkg);
	const version = typeof installed?.version === 'string' ? installed.version : null;
	if (installed === null || version === null) return { state: 'uninstalled' };
	const from = packageRepository(installed.repository);
	const origin = await claimedRepository(dir);
	if (from !== null && origin !== null && from.toLowerCase() !== origin.toLowerCase())
		return { state: 'mismatch', why: `${label} is not ${pkg}'s source: it is a clone of ${origin}, and the installed ${pkg} comes from ${from}.` };
	// What it was checked against: an answer given is asked again only when the clone or the package changes.
	const key = [productRoot, dir, origin ?? '', version].join('\0');
	if (from === null) return { state: 'unconfirmed', why: `the installed ${pkg} names no repository`, key };
	if (origin === null) return { state: 'unconfirmed', why: `${label} has no origin to compare with`, key };
	// A release is tagged as its version, with a v, or as the package at it; a tag is a ref, so a ref name's rule holds.
	for (const tag of [`v${version}`, version, `${pkg}@${version}`].filter(isSafeBranchName))
		if ((await refTip(dir, `refs/tags/${tag}`)) !== null) return { state: 'confirmed' };
	return { state: 'unconfirmed', why: `${label} has no release tag for ${version}, the version installed`, key };
};

/** A person's answer for a design system that could not be confirmed, by what it was checked against: kept, so asked once. */
export class SourceAnswers {
	private readonly file: JsonFile<Record<string, 'use' | 'refuse'>>;

	constructor(path: string) {
		this.file = jsonFile(path, {
			parse: (raw) =>
				Object.fromEntries(
					Object.entries(typeof raw === 'object' && raw !== null ? raw : {}).filter(
						(e): e is [string, 'use' | 'refuse'] => e[1] === 'use' || e[1] === 'refuse',
					),
				),
			fallback: {},
		});
	}

	of(key: string): 'use' | 'refuse' | undefined {
		return this.file.read()[key];
	}

	set(key: string, answer: 'use' | 'refuse'): void {
		this.file.write({ ...this.file.read(), [key]: answer });
	}
}

/** Where the design system in use came from: the product's own repository, beside it, or the person's choice. */
export type ProductHow = 'repository' | 'beside' | 'chosen';

/**
 * The product's design system: the folder the person chose (read as a design system, nothing more); else where the product
 * names it (`placeOf`), proven to be that package's source when beside it, or the person's answer when it cannot be.
 * `usable` may be read and shown; `refused` and `ask` say why not yet; `none`, that nothing is there.
 */
export type ProductDesignSystem =
	| { state: 'none' }
	| { state: 'usable'; root: string; how: ProductHow }
	| { state: 'refused'; root: string; why: string }
	| { state: 'ask'; root: string; why: string; key: string; name: string };

export const productDesignSystem = async (productRoot: string, answers: Pick<SourceAnswers, 'of'>): Promise<ProductDesignSystem> => {
	const chosen = await chosenDesignSystem(productRoot);
	if (chosen !== null) {
		const at = await designSystemIn(chosen);
		if (at !== null) return { state: 'usable', root: at, how: 'chosen' };
		const gone = isFolder(chosen) ? 'holds no design system any more' : 'is not on this computer any more';
		return {
			state: 'refused',
			root: chosen,
			why: `${chosen}, the design system chosen for ${basename(productRoot)}, ${gone}. Choose another, or use the product's.`,
		};
	}
	let pkg: string;
	let dir: string | null;
	let inProduct: boolean;
	try {
		const { designSystem } = readDescriptor(productRoot);
		pkg = designSystem.package;
		const place = placeOf(productRoot, designSystem);
		inProduct = place.inProduct;
		// In the product's repository it is known where it is; beside it, it may be a monorepo of its own.
		dir = await designSystemIn(place.dir, { exactly: inProduct });
	} catch {
		return { state: 'none' };
	}
	if (dir === null) return { state: 'none' };
	// A folder of the product's own repository is the product's code: only that it is the package named is checked, and
	// nothing is asked (a product that is its own design system has nothing installed to be the source of).
	const check = inProduct ? checkName(productRoot, pkg, dir) : await checkSource(productRoot, pkg, dir);
	const how = inProduct ? 'repository' : 'beside';
	if (check.state === 'confirmed' || check.state === 'uninstalled') return { state: 'usable', root: dir, how };
	if (check.state === 'mismatch') return { state: 'refused', root: dir, why: check.why };
	const answer = answers.of(check.key);
	if (answer === 'use') return { state: 'usable', root: dir, how };
	if (answer === 'refuse') return { state: 'refused', root: dir, why: `You chose not to use ${labelOf(productRoot, dir)} as ${pkg}'s source.` };
	return { state: 'ask', root: dir, why: check.why, key: check.key, name: pkg };
};

/** What may be read of the product's design system: its folder when it is usable, else null. */
export const usableDesignSystem = async (productRoot: string, answers: Pick<SourceAnswers, 'of'>): Promise<string | null> => {
	const found = await productDesignSystem(productRoot, answers);
	return found.state === 'usable' ? found.root : null;
};
