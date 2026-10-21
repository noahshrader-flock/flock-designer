import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, renameSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ConnectedDesignSystem, EditedInCode } from '../src/shared/contract';
import { editedInCode, editedOnTip } from '../src/core/services/designSystem/editedInCode';
import { g, writeFiles } from './fixtures';

/**
 * A product with its design system in a folder of its own, as Paradome has it: one repository with the design system's
 * files, a package nested in it, and the product's.
 */
const LIBRARY = {
	'package.json': '{ "name": "product" }\n',
	'app/main.tsx': 'export const app = 1;\n',
	'ds/package.json': '{ "name": "ds" }\n',
	'ds/src/Button/Button.tsx': 'export const Button = 1;\n',
	'ds/src/Button/Button.stories.tsx': "export default { title: 'Button' };\n",
	'ds/src/Button/index.ts': "export * from './Button';\n",
	'ds/src/Chip/Chip.tsx': 'export const Chip = 1;\n',
	'ds/src/Chip/Chip.stories.tsx': "export default { title: 'Chip' };\n",
	'ds/src/utils/theme.ts': 'export const gap = 1;\n',
	// One story above the components' folders, as Primer's `src/` has: it does not make them, or the files beside them, its own.
	'ds/src/Layout.dev.stories.tsx': "export default { title: 'Layout' };\n",
	// Stories apart from their code, as Tremor keeps them: each owns the folder with a file of its name.
	'ds/stories/Card.stories.tsx': "export default { title: 'Card' };\n",
	'ds/stories/Badge.stories.tsx': "export default { title: 'Badge' };\n",
	'ds/src/card/Card.tsx': 'export const Card = 1;\n',
	// A package of its own inside the design system's folder is not the design system.
	'ds/tools/package.json': '{ "name": "tools" }\n',
	'ds/tools/run.ts': 'export const run = 1;\n',
};

let home: string;
let origin: string;
let mine: string;
let system: ConnectedDesignSystem;

const commitAll = (dir: string, message: string) => {
	g(dir, 'add', '-A');
	g(dir, 'commit', '-q', '-m', message);
};

beforeEach(() => {
	home = mkdtempSync(join(tmpdir(), 'fdw-edited-'));
	origin = join(home, 'origin.git');
	g(home, 'init', '-q', '--bare', '-b', 'develop', origin);
	const first = join(home, 'first');
	g(home, 'clone', '-q', origin, first);
	g(first, 'checkout', '-q', '-b', 'develop');
	writeFiles(first, LIBRARY);
	commitAll(first, 'the library');
	g(first, 'push', '-q', '-u', 'origin', 'develop');
	mine = join(home, 'mine');
	g(home, 'clone', '-q', origin, mine);
	g(mine, 'checkout', '-q', '-b', 'feature');
	system = { id: 'o/product:ds', name: 'ds', repository: 'o/product', root: mine, folder: 'ds', branch: 'develop' };
});

afterEach(() => rmSync(home, { recursive: true, force: true }));

const write = (path: string, text: string) => writeFiles(mine, { [path]: text });
const ready = async (): Promise<Extract<EditedInCode, { state: 'ready' }>> => {
	const read = await editedInCode(system);
	if (read.state !== 'ready') throw new Error(`Nothing was found: ${JSON.stringify(read)}`);
	return read;
};
const named = (read: Extract<EditedInCode, { state: 'ready' }>) => read.components.map((c) => c.file);

/** Everything of the person's a read must not touch; read without the index refresh a plain `status` makes. */
const theirs = () => ({
	head: g(mine, 'rev-parse', 'HEAD'),
	branch: g(mine, 'rev-parse', '--abbrev-ref', 'HEAD'),
	index: createHash('sha256')
		.update(readFileSync(join(mine, '.git', 'index')))
		.digest('hex'),
	status: g(mine, '--no-optional-locks', 'status', '--porcelain', '--untracked-files=all'),
});

describe('what the person changed in the design system, read from their checkout', () => {
	it('is nothing when nothing is changed', async () => {
		expect(await editedInCode(system)).toEqual({ state: 'none' });
	});

	it('marks the component whose folder a changed file is in, and only it', async () => {
		write('ds/src/Button/Button.tsx', 'export const Button = 2;\n');
		const read = await ready();
		expect(read.components).toEqual([{ file: 'ds/src/Button/Button.stories.tsx', files: [{ path: 'ds/src/Button/Button.tsx', edit: 'changed' }] }]);
		expect(read.unowned).toEqual([]);
		expect(read.outside).toEqual([]);
	});

	it('lists a file in no component’s folder as in no component, and marks none for it', async () => {
		write('ds/src/utils/theme.ts', 'export const gap = 2;\n');
		const read = await ready();
		expect(read.components).toEqual([]);
		expect(read.unowned).toEqual([{ path: 'ds/src/utils/theme.ts', edit: 'changed' }]);
	});

	it('gives a story kept apart from its code the folder with a file of its name', async () => {
		write('ds/src/card/Card.tsx', 'export const Card = 2;\n');
		write('ds/stories/Card.stories.tsx', "export default { title: 'Card', tags: [] };\n");
		expect((await ready()).components).toEqual([
			{
				file: 'ds/stories/Card.stories.tsx',
				files: [
					{ path: 'ds/src/card/Card.tsx', edit: 'changed' },
					{ path: 'ds/stories/Card.stories.tsx', edit: 'changed' },
				],
			},
		]);
	});

	it('names every file outside the design system, and finds nothing when only those changed', async () => {
		write('app/main.tsx', 'export const app = 2;\n');
		write('ds/tools/run.ts', 'export const run = 2;\n');
		expect(await editedInCode(system)).toEqual({ state: 'none' });
		write('ds/src/Chip/Chip.tsx', 'export const Chip = 2;\n');
		expect((await ready()).outside).toEqual([
			{ path: 'app/main.tsx', edit: 'changed' },
			{ path: 'ds/tools/run.ts', edit: 'changed' },
		]);
	});

	it('finds what is committed, staged, changed, new and untracked, and deleted, alike', async () => {
		write('ds/src/Button/Button.tsx', 'export const Button = 2;\n');
		commitAll(mine, 'committed');
		write('ds/src/Button/index.ts', "export * from './Button';\nexport const staged = 1;\n");
		g(mine, 'add', 'ds/src/Button/index.ts');
		write('ds/src/Chip/Chip.tsx', 'export const Chip = 2;\n');
		write('ds/src/Chip/useChip.ts', 'export const useChip = 1;\n');
		unlinkSync(join(mine, 'ds/src/card/Card.tsx'));
		const read = await ready();
		expect(read.components).toEqual([
			{
				file: 'ds/src/Button/Button.stories.tsx',
				files: [
					{ path: 'ds/src/Button/Button.tsx', edit: 'changed' },
					{ path: 'ds/src/Button/index.ts', edit: 'changed' },
				],
			},
			{
				file: 'ds/src/Chip/Chip.stories.tsx',
				files: [
					{ path: 'ds/src/Chip/Chip.tsx', edit: 'changed' },
					{ path: 'ds/src/Chip/useChip.ts', edit: 'added' },
				],
			},
			{ file: 'ds/stories/Card.stories.tsx', files: [{ path: 'ds/src/card/Card.tsx', edit: 'deleted' }] },
		]);
	});

	it('gives a new component its own files, by the story the person added', async () => {
		write('ds/src/Tag/Tag.tsx', 'export const Tag = 1;\n');
		write('ds/src/Tag/Tag.stories.tsx', "export default { title: 'Tag' };\n");
		expect(named(await ready())).toEqual(['ds/src/Tag/Tag.stories.tsx']);
	});

	it('says a file moved between components in both, gone from one and come to the other', async () => {
		renameSync(join(mine, 'ds/src/Chip/Chip.tsx'), join(mine, 'ds/src/Button/Chip.tsx'));
		g(mine, 'add', '-A');
		const read = await ready();
		expect(read.components).toEqual([
			{ file: 'ds/src/Button/Button.stories.tsx', files: [{ path: 'ds/src/Button/Chip.tsx', edit: 'moved', from: 'ds/src/Chip/Chip.tsx' }] },
			{ file: 'ds/src/Chip/Chip.stories.tsx', files: [{ path: 'ds/src/Chip/Chip.tsx', edit: 'moved', to: 'ds/src/Button/Chip.tsx' }] },
		]);
	});

	it('says a file moved inside one component once', async () => {
		renameSync(join(mine, 'ds/src/Chip/Chip.tsx'), join(mine, 'ds/src/Chip/ChipBase.tsx'));
		g(mine, 'add', '-A');
		expect((await ready()).components).toEqual([
			{ file: 'ds/src/Chip/Chip.stories.tsx', files: [{ path: 'ds/src/Chip/ChipBase.tsx', edit: 'moved', from: 'ds/src/Chip/Chip.tsx' }] },
		]);
	});

	it('is against where the branch left the design system’s, so the design system moving on adds nothing', async () => {
		const other = join(home, 'other');
		g(home, 'clone', '-q', origin, other);
		writeFiles(other, { 'ds/src/Chip/Chip.tsx': 'export const Chip = 3;\n' });
		commitAll(other, 'someone else');
		g(other, 'push', '-q', 'origin', 'develop');
		g(mine, 'fetch', '-q');
		expect(await editedInCode(system)).toEqual({ state: 'none' });
		write('ds/src/Button/Button.tsx', 'export const Button = 2;\n');
		expect(named(await ready())).toEqual(['ds/src/Button/Button.stories.tsx']);
	});

	it('follows the branch checked out', async () => {
		write('ds/src/Button/Button.tsx', 'export const Button = 2;\n');
		commitAll(mine, 'on feature');
		g(mine, 'checkout', '-q', '-b', 'other', 'origin/develop');
		write('ds/src/Chip/Chip.tsx', 'export const Chip = 2;\n');
		expect(named(await ready())).toEqual(['ds/src/Chip/Chip.stories.tsx']);
		g(mine, 'stash', '-q');
		g(mine, 'checkout', '-q', 'feature');
		expect(named(await ready())).toEqual(['ds/src/Button/Button.stories.tsx']);
	});

	it('says nothing on a branch DSNR named: that work is its hand-over’s', async () => {
		g(mine, 'checkout', '-q', '-b', 'dsnr/handoff-20261020-ab12');
		write('ds/src/Button/Button.tsx', 'export const Button = 2;\n');
		expect(await editedInCode(system)).toEqual({ state: 'none' });
	});

	it('is the repository’s root, for a design system that is the whole repository, less the packages inside it', async () => {
		write('ds/src/Button/Button.tsx', 'export const Button = 2;\n');
		write('app/main.tsx', 'export const app = 2;\n');
		const whole = await editedInCode({ ...system, folder: '' });
		expect(whole).toEqual({
			state: 'ready',
			base: expect.any(String),
			components: [],
			unowned: [{ path: 'app/main.tsx', edit: 'changed' }],
			outside: [{ path: 'ds/src/Button/Button.tsx', edit: 'changed' }],
		});
	});

	it('writes nothing in the checkout: its branch, index and files are as they were', async () => {
		write('ds/src/Button/Button.tsx', 'export const Button = 2;\n');
		write('ds/src/Chip/useChip.ts', 'export const useChip = 1;\n');
		g(mine, 'add', 'ds/src/Button/Button.tsx');
		writeFileSync(join(mine, 'ds/src/Chip/Chip.tsx'), 'export const Chip = 2;\n');
		const before = theirs();
		await ready();
		await ready();
		expect(theirs()).toEqual(before);
	});
});

describe('what is edited, as it would be on the design system’s tip the tab draws', () => {
	/** Someone else's change on the design system's branch since the person's branch left it. */
	const moveOn = (files: Record<string, string>) => {
		const other = join(home, 'other');
		g(home, 'clone', '-q', origin, other);
		writeFiles(other, files);
		commitAll(other, 'someone else');
		g(other, 'push', '-q', 'origin', 'develop');
		g(mine, 'fetch', '-q');
		return g(mine, 'rev-parse', 'origin/develop');
	};
	const onTip = async (tip: string) => editedOnTip(system, await ready(), tip);

	it('is the person’s file as it is, where the tip has not changed it', async () => {
		write('ds/src/Button/Button.tsx', 'export const Button = 2;\n');
		const tip = moveOn({ 'ds/src/Chip/Chip.tsx': 'export const Chip = 3;\n' });
		expect(await onTip(tip)).toEqual({ files: new Map([['ds/src/Button/Button.tsx', 'export const Button = 2;\n']]) });
	});

	it('keeps what the tip gained in the same file since, never undoing it', async () => {
		const tip = moveOn({ 'ds/src/Button/Button.tsx': 'export const Button = 1;\nexport const size = 1;\n' });
		write('ds/src/Button/Button.tsx', '// Mine.\nexport const Button = 1;\n');
		expect(await onTip(tip)).toEqual({
			files: new Map([['ds/src/Button/Button.tsx', '// Mine.\nexport const Button = 1;\nexport const size = 1;\n']]),
		});
	});

	it('says which file, and draws nothing, where the tip changed the same lines', async () => {
		const tip = moveOn({ 'ds/src/Button/Button.tsx': 'export const Button = 3;\n' });
		write('ds/src/Button/Button.tsx', 'export const Button = 2;\n');
		expect(await onTip(tip)).toEqual({
			not: 'ds/src/Button/Button.tsx has changed on develop since your branch left it, in the same lines as yours.',
		});
	});

	it('says a file deleted or moved cannot be drawn, and draws nothing', async () => {
		unlinkSync(join(mine, 'ds/src/Chip/Chip.tsx'));
		expect(await onTip(g(mine, 'rev-parse', 'origin/develop'))).toEqual({
			not: 'ds/src/Chip/Chip.tsx is deleted, and the drawing can only change files.',
		});
	});

	it('says a file that is not text cannot be drawn', async () => {
		writeFileSync(join(mine, 'ds/src/Button/icon.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01]));
		expect(await onTip(g(mine, 'rev-parse', 'origin/develop'))).toEqual({
			not: 'ds/src/Button/icon.png is not text, and the drawing can only change text files.',
		});
	});

	it('draws a new file the person added, and none of what is outside the design system', async () => {
		write('ds/src/Tag/Tag.tsx', 'export const Tag = 1;\n');
		write('app/main.tsx', 'export const app = 2;\n');
		expect(await onTip(g(mine, 'rev-parse', 'origin/develop'))).toEqual({ files: new Map([['ds/src/Tag/Tag.tsx', 'export const Tag = 1;\n']]) });
	});
});
