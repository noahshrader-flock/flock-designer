import { dirname } from 'node:path';
import { expect, it } from 'vitest';
import { isStoryFile } from '../src/core/services/designSystem/componentCatalog';
import { componentOwners } from '../src/core/services/designSystem/componentOwners';
import { EVERY_LIBRARY, describeWith, readsOf } from './realCheckouts';

/**
 * Against each real library's layout. The stories in no component are pages about the design system itself (colours,
 * spacing, type) or several in a folder with no file of any one's name: a change there is in no component, never guessed.
 */
for (const { key, system, missing } of EVERY_LIBRARY)
	describeWith(missing, `which component each file of ${key} is part of`, () => {
		const read = async () => {
			const files = await (await readsOf(system)).listFiles('');
			return { files, owner: componentOwners(files), stories: files.filter(isStoryFile) };
		};

		it('puts nine stories in ten, or more, in a component', async () => {
			const { owner, stories } = await read();
			expect(stories.filter((s) => owner(s) !== null).length / stories.length).toBeGreaterThanOrEqual(0.9);
		});

		// A folder above a story's is not its component (Primer's `src/`, with one story of its own, once took 15 of others').
		it('never puts a story in the component of a folder above its own', async () => {
			const { owner, stories } = await read();
			const above = stories.filter((s) => {
				const own = owner(s);
				return own !== null && dirname(own) !== dirname(s) && (dirname(own) === '.' || dirname(s).startsWith(`${dirname(own)}/`));
			});
			expect(above).toEqual([]);
		});

		it('puts every file of a component’s folder in that component', async () => {
			const { files, owner, stories } = await read();
			const folders = stories.filter((s) => owner(`${dirname(s)}/-`) === s).map((s) => [dirname(s), s] as const);
			const strays = folders.flatMap(([folder, s]) => files.filter((f) => dirname(f) === folder && owner(f) !== s));
			expect(strays).toEqual([]);
		});
	});
