import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { asRepositoryPath, parseRemote } from '../../../shared/repoRef';
import { findDesignSystems } from '../designSystem/designSystems';
import { folderReads } from '../designSystem/folderReads';
import { type JsonFile, jsonFile } from '../platform/jsonFile';
import { claimedRepository, git, isSafeBranchName } from '../platform/git';
import { installedVersion } from '../prototypes/installedVersion';
import { designSystemCheckout, readDescriptor } from './descriptor';

const isFolder = (p: string): boolean => existsSync(p) && statSync(p).isDirectory();

/** The design system in `dir`, as the Design System tab would read it (the folder itself, or one inside a monorepo). */
export const designSystemIn = async (dir: string): Promise<string | null> => {
	if (!isFolder(dir)) return null;
	const found = await findDesignSystems(folderReads(dir), basename(dir)).catch(() => []);
	const first = found[0];
	return first === undefined ? null : first.folder === '' ? dir : join(dir, first.folder);
};

const readJson = (file: string): Record<string, unknown> | null => {
	try {
		const v = JSON.parse(readFileSync(file, 'utf8')) as unknown;
		return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null;
	} catch {
		return null;
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
 * Whether the folder `dir` is the source of the package `pkg` the product has installed, read from package.json and git
 * only: the same name, the installed package's repository the clone's `origin`, and a release tag for the installed
 * version. Any one that differs is a mismatch; any one that cannot be read leaves it unconfirmed, saying which. With
 * nothing installed there is nothing to be the source of, so it is used as named.
 */
export type SourceCheck =
	{ state: 'confirmed' } | { state: 'uninstalled' } | { state: 'unconfirmed'; why: string; key: string } | { state: 'mismatch'; why: string };

/** Its package.json names `pkg`; else a mismatch, in words. */
const checkName = (productRoot: string, pkg: string, dir: string): SourceCheck => {
	const name = readJson(join(dir, 'package.json'))?.name;
	return name === pkg
		? { state: 'confirmed' }
		: {
				state: 'mismatch',
				why: `${relative(productRoot, dir) || dir} is not ${pkg}'s source: its package is ${typeof name === 'string' ? name : 'unnamed'}.`,
			};
};

export const checkSource = async (productRoot: string, pkg: string, dir: string): Promise<SourceCheck> => {
	const label = relative(productRoot, dir) || dir;
	const named = checkName(productRoot, pkg, dir);
	if (named.state === 'mismatch') return named;
	const installed = readJson(join(productRoot, 'node_modules', ...pkg.split('/'), 'package.json'));
	const version = installedVersion(join(productRoot, 'node_modules'), pkg);
	if (installed === null || version === null) return { state: 'uninstalled' };
	const from = packageRepository(installed.repository);
	const origin = await claimedRepository(dir);
	if (from !== null && origin !== null && from.toLowerCase() !== origin.toLowerCase())
		return { state: 'mismatch', why: `${label} is not ${pkg}'s source: it is a clone of ${origin}, and the installed ${pkg} comes from ${from}.` };
	// What it was checked against: an answer given is asked again only when the clone or the package changes.
	const key = [productRoot, dir, origin ?? '', version].join('\0');
	if (from === null) return { state: 'unconfirmed', why: `the installed ${pkg} names no repository`, key };
	if (origin === null) return { state: 'unconfirmed', why: `${label} has no origin to compare with`, key };
	const tags = [`v${version}`, version, `${pkg}@${version}`].filter(isSafeBranchName);
	for (const tag of tags)
		if (await git(dir, ['rev-parse', '--verify', '--quiet', `refs/tags/${tag}^{commit}`]).catch(() => null)) return { state: 'confirmed' };
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

/**
 * The product's design system: found where it names it (a folder of its own, or beside it named as its package), then
 * proven to be that package's source, or the person's own answer when it cannot be. `usable` is what may be read and
 * shown; `refused` and `ask` say why not yet; `none`, that nothing is there.
 */
export type ProductDesignSystem =
	| { state: 'none' }
	| { state: 'usable'; root: string }
	| { state: 'refused'; root: string; why: string }
	| { state: 'ask'; root: string; why: string; key: string; name: string };

export const productDesignSystem = async (productRoot: string, answers: Pick<SourceAnswers, 'of'>): Promise<ProductDesignSystem> => {
	let pkg: string;
	let dir: string | null;
	let inProduct: boolean;
	try {
		const { designSystem } = readDescriptor(productRoot);
		pkg = designSystem.package;
		inProduct = designSystem.folder !== undefined;
		dir = await designSystemIn(designSystemCheckout(productRoot, designSystem));
	} catch {
		return { state: 'none' };
	}
	if (dir === null) return { state: 'none' };
	// A folder of the product's own repository is the product's code: only that it is the package named is checked.
	const check = inProduct ? checkName(productRoot, pkg, dir) : await checkSource(productRoot, pkg, dir);
	if (check.state === 'confirmed' || check.state === 'uninstalled') return { state: 'usable', root: dir };
	if (check.state === 'mismatch') return { state: 'refused', root: dir, why: check.why };
	const answer = answers.of(check.key);
	if (answer === 'use') return { state: 'usable', root: dir };
	if (answer === 'refuse')
		return { state: 'refused', root: dir, why: `You chose not to use ${relative(productRoot, dir) || dir} as ${pkg}'s source.` };
	return { state: 'ask', root: dir, why: check.why, key: check.key, name: pkg };
};

/** What may be read of the product's design system: its folder when it is usable, else null. */
export const usableDesignSystem = async (productRoot: string, answers: Pick<SourceAnswers, 'of'>): Promise<string | null> => {
	const found = await productDesignSystem(productRoot, answers);
	return found.state === 'usable' ? found.root : null;
};
