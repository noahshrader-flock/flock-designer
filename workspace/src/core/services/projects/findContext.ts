import { existsSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { DESCRIPTOR_PATH, designSystemCheckout, readDescriptor } from './descriptor';
import { findDesignSystems } from '../designSystem/designSystems';
import { recordsRootFor } from './discovery';
import { folderReads } from '../designSystem/folderReads';
import { repositoryOf } from '../platform/git';

export type FoundHow = 'named' | 'open' | 'located';

export interface Context {
	product: string | null;
	designSystem: { root: string; how: FoundHow } | null;
	designRepository: string | null;
	/** `owner/repo` from the product's `origin`, the same on every machine; null with no product, or one with no remote. */
	productRepository: string | null;
	missing: string[];
}

const isFolder = (p: string): boolean => existsSync(p) && statSync(p).isDirectory();

const designSystemIn = async (dir: string): Promise<string | null> => {
	if (!isFolder(dir)) return null;
	const found = await findDesignSystems(folderReads(dir), basename(dir)).catch(() => []);
	const first = found[0];
	return first === undefined ? null : first.folder === '' ? dir : join(dir, first.folder);
};

const namedBy = async (product: string): Promise<string | null> => {
	try {
		const named = designSystemCheckout(product, readDescriptor(product).designSystem);
		return (await designSystemIn(named)) === null ? null : named;
	} catch {
		return null;
	}
};

export const findContext = async ({ folders, located = null }: { folders: string[]; located?: string | null }): Promise<Context> => {
	const product = folders.find((f) => existsSync(join(f, DESCRIPTOR_PATH))) ?? null;
	let designSystem: Context['designSystem'] = null;
	const named = product === null ? null : await namedBy(product);
	if (named !== null) designSystem = { root: named, how: 'named' };
	for (const folder of folders) {
		if (designSystem !== null) break;
		if (folder === product) continue;
		const root = await designSystemIn(folder);
		if (root !== null) designSystem = { root, how: 'open' };
	}
	if (designSystem === null && located !== null) {
		const root = await designSystemIn(located);
		if (root !== null) designSystem = { root, how: 'located' };
	}
	const designRepository = product === null ? null : recordsRootFor(product);
	const missing = [
		...(product === null ? [`No product is open: open a product's folder, one with ${DESCRIPTOR_PATH}, to see its prototypes.`] : []),
		...(designSystem === null ? ['No design system was found in the open folders: open its folder beside the product, or locate it.'] : []),
		...(designRepository === null
			? ['The design repository (flock-designer) is not beside the product, so its projects are read from GitHub when you are signed in.']
			: []),
	];
	const productRepository = product === null ? null : await repositoryOf(product);
	return { product, designSystem, designRepository, productRepository, missing };
};
