import { describe, expect, it } from 'vitest';
import { productsOf } from '../src/shared/work';
import { aProject, projectIteration } from './fixtures';

/** Which products a project has work in (the workspace README's "Projects, by product"): what the panel will focus and group by. */
describe('productsOf', () => {
	const prototype = (name: string, product: string | null, createdAt: string) =>
		projectIteration({ name, branch: `prototype/demo/${name}`, product, createdAt });
	const codebase = (repository: string | null, createdAt: string) =>
		projectIteration({ name: 'codebase', branch: 'feature/demo', repository, createdAt });

	it('is each product it has work in, once, its newest work’s first', () => {
		const project = aProject({
			id: 'demo',
			iterations: [
				prototype('v1-i1', 'flocksafety/flock-coke', '2026-10-01T10:00:00Z'),
				// Two clones of one repository, whatever they were called: one product.
				prototype('v1-i2', 'flocksafety/flock-coke', '2026-10-02T10:00:00Z'),
				codebase('flocksafety/flock-pepsi', '2026-10-03T10:00:00Z'),
			],
		});
		expect(productsOf(project)).toEqual(['flocksafety/flock-pepsi', 'flocksafety/flock-coke']);
	});

	it('is none for work recorded before products were, or made with none on the machine', () => {
		expect(
			productsOf(aProject({ id: 'old', iterations: [prototype('v1-i1', null, '2026-09-01T10:00:00Z'), codebase(null, '2026-09-02T10:00:00Z')] })),
		).toEqual([]);
		expect(productsOf(aProject({ id: 'empty' }))).toEqual([]);
	});
});
