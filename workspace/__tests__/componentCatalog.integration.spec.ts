import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { expect, it } from 'vitest';
import { designSystemOf } from '../src/shared/catalog';
import { isStoryFile, literalField, readCatalog, UNGROUPED } from '../src/main/services/componentCatalog';
import { libraryReads } from '../src/main/services/designLibrary';
import { REAL_LIBRARY, describeWith, realDevelop } from './realCheckouts';

/** The reader against the real library's branch, not a fixture. */
const REAL = REAL_LIBRARY;
const FUI = designSystemOf({ repository: 'flocksafety/flock-react-component-lib', branch: 'develop' });
const git = (...args: string[]) => execFileSync('git', ['-C', REAL, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const missing = realDevelop === null ? `no clone of the design system with develop at ${REAL} (set FUI_ROOT)` : null;

describeWith(missing, 'against the real library', () => {
	// The app's own reads (one `cat-file --batch` for the stories), so this checks them on the real library too.
	const reads = libraryReads(REAL, `refs/remotes/origin/${FUI.branch}`);

	it('lists every story file Storybook has, and nothing else', async () => {
		const catalog = await readCatalog(reads, FUI);
		const stories = git('ls-tree', '-r', '--name-only', `refs/remotes/origin/${FUI.branch}`).split('\n').filter(isStoryFile);
		expect(catalog.map((c) => c.id).sort()).toEqual(stories.sort());
		expect(catalog.length).toBeGreaterThan(70);
	});

	it('reads every story title, and lists the groups alphabetically', async () => {
		const catalog = await readCatalog(reads, FUI);
		expect(catalog.filter((c) => c.group === UNGROUPED).map((c) => c.id)).toEqual([]);
		const groups = [...new Set(catalog.map((c) => c.group))];
		expect(groups).toEqual([...groups].sort((a, b) => a.localeCompare(b)));
		// The library's own sidebar has Inputs before Data Display: this does not.
		expect(groups.indexOf('Data Display')).toBeLessThan(groups.indexOf('Inputs'));
	});

	it("builds every Storybook id exactly as the library's own Storybook does", async () => {
		const csf = createRequire(`${REAL}/package.json`)('storybook/internal/csf') as { toId: (kind: string, name: string) => string };
		const catalog = await readCatalog(reads, FUI);
		for (const c of catalog) {
			const title = literalField(await reads.readFile(c.id), 'title')!;
			expect(c.storybook).toBe(`${FUI.storybook}?path=/docs/${csf.toId(title, 'Docs')}`);
		}
	});
});
