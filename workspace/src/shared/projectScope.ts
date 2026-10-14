import type { Project } from './contract';
import { productsOf } from './work';

/**
 * What the Projects panel focuses on and how it groups (PROJECT_SCOPE_PLAN Phase 2): a focus, not a lock. Who can see or
 * comment on a project is the design repository's permission; these only choose what is shown first, and under what.
 */

/** Whether a project is the open product's: it has work in it, or it has no product on record, which nothing hides (D1). */
export const inThisProduct = (project: Project, product: string): boolean => {
	const products = productsOf(project);
	return products.length === 0 || products.includes(product);
};

/** One product's projects, in the by-product view; `product` null for those with none on record. */
export interface ProductGroup {
	product: string | null;
	projects: Project[];
	/** The other products a project in this group has work in, for its label. */
	alsoIn: (project: Project) => string[];
}

/**
 * Projects under a section for each product, across products: the open one first, then the rest by name, "No product"
 * last. A project with work in two is under its newest work's product, once, and says where else it is (`alsoIn`).
 */
export const byProduct = (projects: Project[], open: string | null): ProductGroup[] => {
	const under = new Map<string | null, Project[]>();
	for (const p of projects) {
		const product = productsOf(p)[0] ?? null;
		under.set(product, [...(under.get(product) ?? []), p]);
	}
	const named = [...under.keys()].filter((k): k is string => k !== null);
	const order = [
		...(open !== null && under.has(open) ? [open] : []),
		...named.filter((k) => k !== open).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })),
		...(under.has(null) ? [null] : []),
	];
	return order.map((product) => ({
		product,
		projects: under.get(product) ?? [],
		alsoIn: (project) => productsOf(project).filter((p) => p !== product),
	}));
};

/** What each product is called on screen: its repository's name, with its owner only where two share one. */
export const productNames = (products: string[]): Map<string, string> => {
	const repo = (p: string) => p.split('/').at(-1) ?? p;
	return new Map(products.map((p) => [p, products.some((q) => q !== p && repo(q) === repo(p)) ? p : repo(p)]));
};
