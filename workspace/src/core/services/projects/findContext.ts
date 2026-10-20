import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { DESCRIPTOR_PATH } from './descriptor';
import { recordsRootFor } from './discovery';
import { repositoryOf } from '../platform/git';
import { type ProductDesignSystem, type SourceAnswers, designSystemIn, productDesignSystem } from './productDesignSystem';

export type FoundHow = 'named' | 'open' | 'located';

export interface Context {
	product: string | null;
	designSystem: { root: string; how: FoundHow } | null;
	designRepository: string | null;
	/** `owner/repo` from the product's `origin`, the same on every machine; null with no product, or one with no remote. */
	productRepository: string | null;
	/** The product's own design system, found and checked (`productDesignSystem`); null with no product. */
	source: ProductDesignSystem | null;
	missing: string[];
}

/** Nothing answered yet: a design system that cannot be confirmed is asked about. */
const NO_ANSWERS: Pick<SourceAnswers, 'of'> = { of: () => undefined };

export const findContext = async ({
	folders,
	located = null,
	answers = NO_ANSWERS,
}: {
	folders: string[];
	located?: string | null;
	answers?: Pick<SourceAnswers, 'of'>;
}): Promise<Context> => {
	const product = folders.find((f) => existsSync(join(f, DESCRIPTOR_PATH))) ?? null;
	let designSystem: Context['designSystem'] = null;
	// The product's own, only once it is shown to be its package's source (or the person said to use it).
	const source = product === null ? null : await productDesignSystem(product, answers);
	if (source?.state === 'usable') designSystem = { root: source.root, how: 'named' };
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
		...(source?.state === 'refused' ? [source.why] : []),
		...(product === null ? [`No product is open: open a product's folder, one with ${DESCRIPTOR_PATH}, to see its prototypes.`] : []),
		...(designSystem === null ? ['No design system was found in the open folders: open its folder beside the product, or locate it.'] : []),
		...(designRepository === null
			? ['The design repository (flock-designer) is not beside the product, so its projects are read from GitHub when you are signed in.']
			: []),
	];
	const productRepository = product === null ? null : await repositoryOf(product);
	return { product, designSystem, designRepository, productRepository, source, missing };
};
