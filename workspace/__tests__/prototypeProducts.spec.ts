import { describe, expect, it } from 'vitest';
import { productsOf } from '../src/shared/work';
import { aPrototype, prototypeWork } from './fixtures';

describe('productsOf', () => {
	const version = (name: string, product: string | null, createdAt: string) =>
		prototypeWork({ name, branch: `prototype/demo/${name}`, product, createdAt });
	const codebase = (repository: string | null, createdAt: string) =>
		prototypeWork({ name: 'codebase', branch: 'feature/demo', repository, createdAt });

	it('is each product it has work in, once, its newest work’s first', () => {
		const prototype = aPrototype({
			id: 'demo',
			work: [
				version('v1', 'flocksafety/flock-coke', '2026-10-01T10:00:00Z'),
				// Two clones of one repository, whatever they were called: one product.
				version('v2', 'flocksafety/flock-coke', '2026-10-02T10:00:00Z'),
				codebase('flocksafety/flock-pepsi', '2026-10-03T10:00:00Z'),
			],
		});
		expect(productsOf(prototype)).toEqual(['flocksafety/flock-pepsi', 'flocksafety/flock-coke']);
	});

	it('is none for work recorded before products were, or made with none on the machine', () => {
		expect(
			productsOf(aPrototype({ id: 'old', work: [version('v1', null, '2026-09-01T10:00:00Z'), codebase(null, '2026-09-02T10:00:00Z')] })),
		).toEqual([]);
		expect(productsOf(aPrototype({ id: 'empty' }))).toEqual([]);
	});
});
