import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { DESCRIPTOR_PATH } from './descriptor';
import { type DesignRepositoryClones, NO_CLONES, designRepositoryMissing, recordsRootFor } from './discovery';
import { repositoryOf } from '../platform/git';
import { HOST } from '../../../shared/vocabulary';
import { type ProductDesignSystem, type ProductHow, type SourceAnswers, designSystemIn, productDesignSystem } from './productDesignSystem';

/** Where the design system shown came from: the product's (`productDesignSystem`), or, with none of its own, a folder open here. */
export type FoundHow = ProductHow | 'open';

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
	answers = NO_ANSWERS,
	clones = NO_CLONES,
}: {
	folders: string[];
	answers?: Pick<SourceAnswers, 'of'>;
	/** Where the person keeps a design repository's clone, when not beside the product. */
	clones?: Pick<DesignRepositoryClones, 'at'>;
}): Promise<Context> => {
	const product = folders.find((f) => existsSync(join(f, DESCRIPTOR_PATH))) ?? null;
	let designSystem: Context['designSystem'] = null;
	// The product's own, only once it is shown to be its package's source (or the person said to use it).
	const source = product === null ? null : await productDesignSystem(product, answers);
	if (source?.state === 'usable') designSystem = { root: source.root, how: source.how };
	// Another open folder may stand in, but never for one refused: why it was is said instead.
	for (const folder of source?.state === 'refused' ? [] : folders) {
		if (designSystem !== null) break;
		if (folder === product) continue;
		const root = await designSystemIn(folder);
		if (root !== null) designSystem = { root, how: 'open' };
	}
	const designRepository = product === null ? null : recordsRootFor(product, { clones });
	const missing = [
		...(source?.state === 'refused' ? [source.why] : []),
		...(product === null ? [`No product is open: open a product's folder, one with ${DESCRIPTOR_PATH}, to see its prototypes.`] : []),
		...(designSystem === null ? ['No design system was found in the open folders: open its folder beside the product, or choose one.'] : []),
		...(product !== null && designRepository === null
			? [`${designRepositoryMissing(product)} Until then its projects are read from ${HOST} when you are signed in.`]
			: []),
	];
	const productRepository = product === null ? null : await repositoryOf(product);
	return { product, designSystem, designRepository, productRepository, source, missing };
};
