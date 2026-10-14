import { describe, expect, it } from 'vitest';
import { byProduct, inThisProduct, productNames } from '../src/shared/projectScope';
import { aProject, projectIteration } from './fixtures';

/** What the Projects panel focuses on and groups by (PROJECT_SCOPE_PLAN Phase 2), as rules a test can read. */

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
	it('are those with work in it, and those with no product on record, which nothing hides (D1)', () => {
		expect(inThisProduct(on('a', [COKE, '2026-10-01']), COKE)).toBe(true);
		expect(inThisProduct(on('b', [PEPSI, '2026-10-01'], [COKE, '2026-10-02']), COKE)).toBe(true);
		expect(inThisProduct(on('c', [null, '2026-09-01']), COKE)).toBe(true);
		expect(inThisProduct(on('d', [PEPSI, '2026-10-01']), COKE)).toBe(false);
	});
});

describe('everyone’s projects, by product', () => {
	it('puts the open product first, then the rest by name, and No product last', () => {
		const groups = byProduct([on('p', [PEPSI, '2026-10-01']), on('n', [null, '2026-09-01']), on('c', [COKE, '2026-10-01'])], PEPSI);
		expect(groups.map((g) => [g.product, g.projects.map((p) => p.id)])).toEqual([
			[PEPSI, ['p']],
			[COKE, ['c']],
			[null, ['n']],
		]);
	});

	it('shows a project in two products once, under its newest work’s, and says where else it is', () => {
		const both = on('both', [COKE, '2026-10-01'], [PEPSI, '2026-10-03']);
		const groups = byProduct([both], null);
		expect(groups.map((g) => [g.product, g.projects.map((p) => p.id)])).toEqual([[PEPSI, ['both']]]);
		expect(groups[0]!.alsoIn(both)).toEqual([COKE]);
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
