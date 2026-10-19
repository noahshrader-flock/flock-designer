import { describe, expect, it } from 'vitest';
import {
	byProduct,
	inThisProduct,
	isMine,
	needsProduct,
	productNames,
	productsByProject,
	scopeShown,
	scopesOffered,
} from '../src/shared/projectScope';
import { productsOf } from '../src/shared/work';
import { aProject, projectWork } from './fixtures';

const COKE = 'flocksafety/flock-coke';
const PEPSI = 'flocksafety/flock-pepsi';
const on = (id: string, ...made: [string | null, string][]) =>
	aProject({
		id,
		work: made.map(([product, createdAt], i) => projectWork({ name: `v${i + 1}`, branch: `prototype/${id}/v${i + 1}`, product, createdAt })),
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

describe('my projects', () => {
	const by = (id: string, ...people: { name: string; login: string | null }[]) => ({ ...aProject({ id }), people });

	it('are those I have worked on, by my login in any case, and none without one', () => {
		expect(isMine(by('a', { name: 'Noah', login: 'noah' }), 'noah')).toBe(true);
		expect(isMine(by('b', { name: 'Someone', login: 'someone' }, { name: 'Noah', login: 'Noah' }), 'NOAH')).toBe(true);
		expect(isMine(by('c', { name: 'Someone', login: 'someone' }), 'noah')).toBe(false);
		// A name alone is not an account: only a login says who it was.
		expect(isMine(by('d', { name: 'noah', login: null }), 'noah')).toBe(false);
		expect(isMine(by('e', { name: 'Noah', login: 'noah' }), null)).toBe(false);
	});
});

describe('whose projects can be chosen', () => {
	it('offers the open product’s only with one open, and mine only signed in', () => {
		expect(scopesOffered({ hasProduct: true, signedIn: true })).toEqual(['here', 'everyone', 'mine']);
		expect(scopesOffered({ hasProduct: true, signedIn: false })).toEqual(['here', 'everyone']);
		expect(scopesOffered({ hasProduct: false, signedIn: true })).toEqual(['everyone', 'mine']);
		expect(scopesOffered({ hasProduct: false, signedIn: false })).toEqual(['everyone']);
	});

	it('shows what was chosen while it is offered, and else the first: signing out, or another product, ends a choice', () => {
		expect(scopeShown('mine', ['here', 'everyone', 'mine'])).toBe('mine');
		expect(scopeShown('mine', ['here', 'everyone'])).toBe('here');
		expect(scopeShown('here', ['everyone', 'mine'])).toBe('everyone');
	});
});
