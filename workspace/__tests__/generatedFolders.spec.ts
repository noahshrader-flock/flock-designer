import { expect, it } from 'vitest';
import { GENERATED_FOLDERS, inGeneratedFolder } from '../src/shared/generatedFolders';

/** One list of the folders no one writes by hand, asked the same way everywhere. */
it('finds a path in an installed, built or generated folder at any depth, and not a file merely named like one', () => {
	expect(GENERATED_FOLDERS).toEqual(['node_modules', 'dist', 'build', 'out', 'coverage', 'storybook-static']);
	for (const p of ['node_modules/x/a.ts', 'packages/ui/dist/a.css', 'out/viewer/viewer.js', 'coverage/lcov.info', 'storybook-static/index.html'])
		expect(inGeneratedFolder(p), p).toBe(true);
	for (const p of ['src/build.ts', 'src/distance/a.ts', 'dist', 'README.md']) expect(inGeneratedFolder(p), p).toBe(false);
});
