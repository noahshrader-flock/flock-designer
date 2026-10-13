import { existsSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { DESCRIPTOR_PATH, designSystemCheckout, readDescriptor } from './descriptor';
import { findDesignSystems } from './designSystems';
import { recordsRootFor } from './discovery';
import { folderReads } from './folderReads';

/** How the design system was found, in the order it is looked for. */
export type FoundHow = 'named' | 'open' | 'located';

/** What a shell works on, found from what is open in it (ELECTRON_MIGRATION_PLAN, §1.6), and what is missing, said. */
export interface Context {
	/** The product repository: the open folder with a `.dsnr/workspace.json`. */
	product: string | null;
	designSystem: { root: string; how: FoundHow } | null;
	/** Where the projects' records are: the design repository beside the product, as the core finds it everywhere. */
	designRepository: string | null;
	missing: string[];
}

const isFolder = (p: string): boolean => existsSync(p) && statSync(p).isDirectory();

/** The design system in `dir`: the folder itself, or the package in it with stories or tokens (the app's own rule). */
const designSystemIn = async (dir: string): Promise<string | null> => {
	if (!isFolder(dir)) return null;
	const found = await findDesignSystems(folderReads(dir), basename(dir)).catch(() => []);
	const first = found[0];
	return first === undefined ? null : first.folder === '' ? dir : join(dir, first.folder);
};

/** What the product names as its design system: a folder of it, or the checkout beside it named as its package. */
const namedBy = async (product: string): Promise<string | null> => {
	try {
		const named = designSystemCheckout(product, readDescriptor(product).designSystem);
		return (await designSystemIn(named)) === null ? null : named;
	} catch {
		return null;
	}
};

/**
 * Finds the product, its design system and the design repository from the `folders` open in the editor and, when nothing
 * open holds a design system, the one the person `located`. The design system is looked for in order: where the product
 * names it, then any other open folder holding one, then the located one; each only when it does hold one.
 */
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
	return { product, designSystem, designRepository, missing };
};
