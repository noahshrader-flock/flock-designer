import type { Project } from './contract';
import { productsOf } from './work';

/** A focus, not a lock: who can see or comment on a project is the design repository's permission. */

/** `here`: the open product's. */
export type Scope = 'here' | 'everyone' | 'mine';

/** Mine only signed in: nothing says whose they would be. */
export const scopesOffered = ({ hasProduct, signedIn }: { hasProduct: boolean; signedIn: boolean }): Scope[] => [
	...(hasProduct ? (['here'] as const) : []),
	'everyone',
	...(signedIn ? (['mine'] as const) : []),
];

export const scopeShown = (chosen: Scope, offered: Scope[]): Scope => (offered.includes(chosen) ? chosen : (offered[0] ?? 'everyone'));

export const productsByProject = (projects: Project[]): Map<Project, string[]> => new Map(projects.map((p) => [p, productsOf(p)]));

/** A project with no product on record is in every one, so nothing hides it. */
export const inThisProduct = (products: string[], open: string): boolean => products.length === 0 || products.includes(open);

/** By login: a name alone is not an account. */
export const isMine = (project: Project, login: string | null): boolean =>
	login !== null && project.people.some((person) => person.login?.toLowerCase() === login.toLowerCase());

/** `product` is null for projects with none on record. */
export interface ProductGroup {
	product: string | null;
	projects: { project: Project; alsoIn: string[] }[];
}

/**
 * The open product first, then the rest by name, none last. A project with work in two is under its newest work's product,
 * once, and says where else it is (`alsoIn`).
 */
export const byProduct = (projects: Project[], products: Map<Project, string[]>, open: string | null): ProductGroup[] => {
	const under = new Map<string | null, ProductGroup['projects']>();
	for (const project of projects) {
		const [first = null, ...rest] = products.get(project) ?? [];
		under.set(first, [...(under.get(first) ?? []), { project, alsoIn: rest }]);
	}
	const named = [...under.keys()].filter((k): k is string => k !== null);
	const order = [
		...(open !== null && under.has(open) ? [open] : []),
		...named.filter((k) => k !== open).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })),
		...(under.has(null) ? [null] : []),
	];
	return order.map((product) => ({ product, projects: under.get(product) ?? [] }));
};

/** Its owner only where two share a repository name. */
export const productNames = (products: string[]): Map<string, string> => {
	const repo = (p: string) => p.split('/').at(-1) ?? p;
	return new Map(products.map((p) => [p, products.some((q) => q !== p && repo(q) === repo(p)) ? p : repo(p)]));
};

/** With no product on record, any open product is taken, since which it was is not known. */
export const needsProduct = (products: string[], open: string | null): string | null => {
	if (open !== null && (products.length === 0 || products.includes(open))) return null;
	const made = products[0];
	return `Open ${made ? `${productNames(products).get(made) ?? made}, the product` : 'the product'} this prototype was made on: what changes it is there.`;
};
