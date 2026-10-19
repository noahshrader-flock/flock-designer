import { createRequire } from 'node:module';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { designSystemOf } from '../src/shared/catalog';
import { isStoryFile, literalField, readCatalog } from '../src/core/services/designSystem/componentCatalog';
import { EVERY_LIBRARY, describeWith, readsOf } from './realCheckouts';
import { g } from './fixtures';

/** Storybook's own id rule, from the library's own Storybook; null for a Storybook that has none to give. */
const csfOf = (root: string): ((kind: string, name: string) => string) | null => {
	for (const module of ['storybook/internal/csf', '@storybook/csf'])
		try {
			return (createRequire(join(root, 'package.json'))(module) as { toId: (kind: string, name: string) => string }).toId;
		} catch {
			// Not this Storybook's.
		}
	return null;
};

for (const { key, system, missing } of EVERY_LIBRARY)
	describeWith(missing, `the components of ${key}`, () => {
		const catalog = async () => readCatalog(await readsOf(system), designSystemOf(system));

		it('lists every story file Storybook has, and nothing else', async () => {
			const ref = `refs/remotes/origin/${system.branch}`;
			const stories = g(system.root, 'ls-tree', '-r', '--name-only', ref, '--', system.folder || '.')
				.split('\n')
				.filter(isStoryFile);
			expect((await catalog()).map((c) => c.id).sort()).toEqual(stories.sort());
		});

		it('reads every story’s title, and lists the groups alphabetically', async () => {
			const read = await catalog();
			expect(read.filter((c) => c.storybookPath === null).map((c) => c.id)).toEqual([]);
			const groups = [...new Set(read.map((c) => c.group))];
			expect(groups).toEqual([...groups].sort((a, b) => a.localeCompare(b)));
		});

		const toId = csfOf(join(system.root, system.folder));
		it.skipIf(toId === null)(
			`names each Storybook page exactly as ${key}’s own Storybook does${toId === null ? ' (its Storybook gives no id rule)' : ''}`,
			async () => {
				const reads = await readsOf(system);
				for (const c of await readCatalog(reads, designSystemOf(system))) {
					const title = literalField(await reads.readFile(c.id), 'title') as string;
					expect(c.storybookPath, c.id).toBe(`?path=/docs/${toId?.(title, 'Docs')}`);
				}
			},
		);
	});

const [fui] = EVERY_LIBRARY;
describeWith(fui?.missing ?? null, 'FUI’s own components', () => {
	it('are many, and grouped as its titles say: Data Display before Inputs, which its own sidebar orders the other way', async () => {
		const read = await readCatalog(await readsOf(fui!.system), designSystemOf(fui!.system));
		expect(read.length).toBeGreaterThan(70);
		const groups = [...new Set(read.map((c) => c.group))];
		expect(groups.indexOf('Data Display')).toBeLessThan(groups.indexOf('Inputs'));
	});
});
