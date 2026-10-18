import type { Project } from './contract';
import { productsOf } from './work';

/**
 * What the Projects panel focuses on and how it groups, with a product open or none (the workspace README's "Projects, by
 * product"): a focus, not a lock. Who can see or comment on a project is the design repository's permission; these only
 * choose what is shown first, and under what.
 */

/** Whose projects the panel shows: the open product's, everyone's, or mine. */
export type Scope = 'here' | 'everyone' | 'mine';

/** What can be chosen: the open product's only with one open; mine only signed in (nothing says whose they would be). */
export const scopesOffered = ({ hasProduct, signedIn }: { hasProduct: boolean; signedIn: boolean }): Scope[] => [
	...(hasProduct ? (['here'] as const) : []),
	'everyone',
	...(signedIn ? (['mine'] as const) : []),
];

/** What is shown: what was chosen while it is still offered (signing out, or another product, can end that), else the first. */
export const scopeShown = (chosen: Scope, offered: Scope[]): Scope => (offered.includes(chosen) ? chosen : (offered[0] ?? 'everyone'));

/** Each project's products (`productsOf`), worked out once for every rule below to read. */
export const productsByProject = (projects: Project[]): Map<Project, string[]> => new Map(projects.map((p) => [p, productsOf(p)]));

/** Whether a project with these products is the open product's: it has work in it, or it has none on record, which nothing hides. */
export const inThisProduct = (products: string[], open: string): boolean => products.length === 0 || products.includes(open);

/**
 * Whether a project is mine: I have worked on it (code on any work, or its folder in the design repository), by my
 * login. A name alone is not an account, and with no login, signed out, none is.
 */
export const isMine = (project: Project, login: string | null): boolean =>
	login !== null && project.people.some((person) => person.login?.toLowerCase() === login.toLowerCase());

/** One product's projects, in the by-product view (`product` null for those with none on record), each with where else it is. */
export interface ProductGroup {
	product: string | null;
	projects: { project: Project; alsoIn: string[] }[];
}

/**
 * Projects under a section for each product, across products: the open one first, then the rest by name, "No product"
 * last. A project with work in two is under its newest work's product, once, and says where else it is (`alsoIn`).
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

/** What each product is called on screen: its repository's name, with its owner only where two share one. */
export const productNames = (products: string[]): Map<string, string> => {
	const repo = (p: string) => p.split('/').at(-1) ?? p;
	return new Map(products.map((p) => [p, products.some((q) => q !== p && repo(q) === repo(p)) ? p : repo(p)]));
};

/**
 * Why work that changes a prototype's code (Address, Build in the codebase) cannot be done here, or null when it can: it is
 * done with the product the prototype was made on, which must be the one open. With none on record, any open product is
 * taken, since which it was is not known.
 */
export const needsProduct = (products: string[], open: string | null): string | null => {
	if (open !== null && (products.length === 0 || products.includes(open))) return null;
	const made = products[0];
	return `Open ${made ? `${productNames(products).get(made) ?? made}, the product` : 'the product'} this prototype was made on: what changes it is there.`;
};
