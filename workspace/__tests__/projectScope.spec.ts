import { describe, expect, it } from 'vitest';
import { byProduct, inThisProduct, needsProduct, productNames, productsByProject } from '../src/shared/projectScope';
import { productsOf } from '../src/shared/work';
import { aProject, projectIteration } from './fixtures';

/** What the Projects panel focuses on and groups by (the workspace README's "Projects, by product"), as rules a test can read. */

const COKE = 'flocksafety/flock-coke';
const PEPSI = 'flocksafety/flock-pepsi';
const on = (id: string, ...made: [string | null, string][]) =>
	aProject({
		id,
		iterations: made.map(([product, createdAt], i) =>
			projectIteration({ name: `v1-i${i + 1}`, branch: `prototype/${id}/v1-i${i + 1}`, product, createdAt }),
		),
	});

describe('this product’s projects', () => {
	it('are those with work in it, and those with no product on record, which nothing hides', () => {
		const here = (p: ReturnType<typeof on>) => inThisProduct(productsOf(p), COKE);
		expect(here(on('a', [COKE, '2026-10-01']))).toBe(true);
		expect(here(on('b', [PEPSI, '2026-10-01'], [COKE, '2026-10-02']))).toBe(true);
		expect(here(on('c', [null, '2026-09-01']))).toBe(true);
		expect(here(on('d', [PEPSI, '2026-10-01']))).toBe(false);
	});
});

describe('everyone’s projects, by product', () => {
	it('puts the open product first, then the rest by name, and No product last', () => {
		const projects = [on('p', [PEPSI, '2026-10-01']), on('n', [null, '2026-09-01']), on('c', [COKE, '2026-10-01'])];
		const groups = byProduct(projects, productsByProject(projects), PEPSI);
		expect(groups.map((g) => [g.product, g.projects.map((e) => e.project.id)])).toEqual([
			[PEPSI, ['p']],
			[COKE, ['c']],
			[null, ['n']],
		]);
	});

	it('shows a project in two products once, under its newest work’s, and says where else it is', () => {
		const both = on('both', [COKE, '2026-10-01'], [PEPSI, '2026-10-03']);
		const groups = byProduct([both], productsByProject([both]), null);
		expect(groups.map((g) => [g.product, g.projects.map((e) => [e.project.id, e.alsoIn])])).toEqual([[PEPSI, [['both', [COKE]]]]]);
	});
});

describe('a product’s name', () => {
	it('is its repository’s name, with its owner only where two share one', () => {
		expect(productNames(['flocksafety/flock-coke', 'flocksafety/flock-pepsi'])).toEqual(
			new Map([
				['flocksafety/flock-coke', 'flock-coke'],
				['flocksafety/flock-pepsi', 'flock-pepsi'],
			]),
		);
		expect(productNames(['flocksafety/ui', 'acme/ui'])).toEqual(
			new Map([
				['flocksafety/ui', 'flocksafety/ui'],
				['acme/ui', 'acme/ui'],
			]),
		);
	});
});

describe('where a prototype’s comment is Addressed', () => {
	it('is with the product it was made on: refused, naming it, with none open or another', () => {
		expect(needsProduct([COKE], null)).toBe('Open flock-coke, the product this prototype was made on: what changes it is there.');
		expect(needsProduct([COKE], PEPSI)).toBe('Open flock-coke, the product this prototype was made on: what changes it is there.');
		// None on record: any open product is taken, since which it was is not known.
		expect(needsProduct([], null)).toBe('Open the product this prototype was made on: what changes it is there.');
		expect(needsProduct([], PEPSI)).toBeNull();
		expect(needsProduct([PEPSI, COKE], COKE)).toBeNull();
	});
});
