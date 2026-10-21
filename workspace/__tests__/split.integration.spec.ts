import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ConnectedDesignSystem, SplitCheck, SplitPreview } from '../src/shared/contract';
import { checkSplit, splitPreview } from '../src/core/services/designSystem/split';
import { SplitProof } from '../src/core/services/designSystem/splitProof';
import { g, settledAnswer, writeFiles } from './fixtures';

/**
 * A design system TypeScript checks, with one error of its own before any change (`old.ts`), so "builds" is seen to mean
 * no new error against its branch. Its packages are this repository's own, so the test has TypeScript to run.
 */
const LIBRARY = {
	'package.json': '{ "name": "ds" }\n',
	'.gitignore': 'node_modules\n',
	'tsconfig.json':
		'{ "compilerOptions": { "strict": true, "noEmit": true, "skipLibCheck": true, "types": [], "module": "esnext", "moduleResolution": "bundler", "target": "es2022" }, "include": ["src"] }\n',
	'src/old.ts': "export const old: number = 'not a number';\n",
	'src/theme.ts': 'export const gap = 1;\n',
	'src/Button/Button.ts': "import { gap } from '../theme';\nexport const Button = gap;\n",
	'src/Button/Button.stories.ts': "export default { title: 'Button' };\n",
	'src/Chip/Chip.ts': 'export const Chip = 1;\n',
	'src/Chip/Chip.stories.ts': "export default { title: 'Chip' };\n",
};
const INSTALLED = join(__dirname, '..', 'node_modules');

let home: string;
let origin: string;
let mine: string;
let system: ConnectedDesignSystem;
let proof: SplitProof;
let folder: string;

const commitAll = (dir: string, message: string) => {
	g(dir, 'add', '-A');
	g(dir, 'commit', '-q', '-m', message);
};

beforeEach(() => {
	home = mkdtempSync(join(tmpdir(), 'fdw-split-'));
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
	symlinkSync(INSTALLED, join(mine, 'node_modules'));
	system = { id: 'o/ds', name: 'ds', repository: 'o/ds', root: mine, folder: '', branch: 'develop' };
	folder = join(home, 'split-checks');
	proof = new SplitProof({ folder });
});

afterEach(() => {
	proof.stop();
	rmSync(home, { recursive: true, force: true });
});

const write = (files: Record<string, string>) => writeFiles(mine, files);
const ready = async (): Promise<Extract<SplitPreview, { state: 'ready' }>> => {
	const preview = await splitPreview(proof, system);
	if (preview.state !== 'ready') throw new Error(`No split: ${JSON.stringify(preview)}`);
	return preview;
};
/** Checked, and waited for to the end. */
const checked = async (): Promise<SplitCheck> => {
	await checkSplit(proof, system);
	return (await settledAnswer(ready, (p) => p.check.state === 'checking', { within: 120_000, every: 100 })).check;
};

/** A button that uses a new token, a chip changed alone: the shape most real commits had (spikes 3 and 8). */
const buttonOnTheme = () =>
	write({
		'src/theme.ts': 'export const gap = 1;\nexport const size = 2;\n',
		'src/Button/Button.ts': "import { gap, size } from '../theme';\nexport const Button = gap + size;\n",
		'src/Chip/Chip.ts': 'export const Chip = 2;\n',
	});

describe('the pull requests a split would make, before anything is made', () => {
	it('lists one a component and the shared files their own, with their lines, and what stays in the branch, unchecked', async () => {
		buttonOnTheme();
		write({ 'package-lock.json': '{}\n' });
		const preview = await ready();
		expect(preview.units.map((u) => [u.file, u.files.map((f) => f.path), u.lines])).toEqual([
			[null, ['src/theme.ts'], 1],
			['src/Button/Button.stories.ts', ['src/Button/Button.ts'], 4],
			['src/Chip/Chip.stories.ts', ['src/Chip/Chip.ts'], 2],
		]);
		expect(preview.stays).toEqual([{ file: { path: 'package-lock.json', edit: 'added' }, why: 'a lockfile' }]);
		expect(preview.check).toEqual({ state: 'not-checked' });
	});
});

describe('the check that each builds, on what it stands on', () => {
	it('stands a component on the shared file it needs, and one that needs nothing on the branch, with no new error', async () => {
		buttonOnTheme();
		const check = await checked();
		expect(check).toMatchObject({
			state: 'built',
			by: 'TypeScript, against its tsconfig.json',
			stacks: [
				{ unit: 0, on: null },
				{ unit: 2, on: null },
				{ unit: 1, on: 0 },
			],
		});
	});

	it('splits nothing when the whole change does not build, and says the first new error', async () => {
		write({ 'src/Button/Button.ts': "import { nope } from '../theme';\nexport const Button = nope;\n" });
		const check = await checked();
		expect(check.state).toBe('fails');
		expect(check.state === 'fails' && check.why).toMatch(
			/^Your change does not build on develop as a whole, so it is not split\. src\/Button\/Button\.ts: /,
		);
	});

	it('checks nothing, and says which file, where the branch changed the same lines since', async () => {
		const other = join(home, 'other');
		g(home, 'clone', '-q', origin, other);
		writeFiles(other, { 'src/Chip/Chip.ts': 'export const Chip = 3;\n' });
		commitAll(other, 'someone else');
		g(other, 'push', '-q', 'origin', 'develop');
		g(mine, 'fetch', '-q');
		write({ 'src/Chip/Chip.ts': 'export const Chip = 2;\n' });
		await checkSplit(proof, system);
		expect((await ready()).check).toEqual({
			state: 'fails',
			why: 'src/Chip/Chip.ts has changed on develop since your branch left it, in the same lines as yours.',
		});
	});

	it('says why it cannot be checked where TypeScript is not installed, and still lists the pull requests', async () => {
		unlinkSync(join(mine, 'node_modules'));
		buttonOnTheme();
		const check = await checked();
		expect(check).toEqual({
			state: 'unproven',
			why: `Its packages are not installed in ${mine}, so TypeScript is not there to check that each builds.`,
		});
		expect((await ready()).units).toHaveLength(3);
	});

	it('stops when asked, says so, and leaves none of its copy', async () => {
		buttonOnTheme();
		await checkSplit(proof, system);
		proof.stop();
		expect(
			await settledAnswer(
				async () => (await ready()).check,
				(c) => c.state === 'checking',
				{ within: 60_000, every: 100 },
			),
		).toEqual({
			state: 'stopped',
			why: 'Stopped.',
		});
		await settledAnswer(
			() => (existsSync(folder) ? readdirSync(folder) : []),
			(left) => left.length > 0,
		);
	});

	it('is not the check of the edits once they change', async () => {
		buttonOnTheme();
		expect((await checked()).state).toBe('built');
		write({ 'src/Chip/Chip.ts': 'export const Chip = 3;\n' });
		expect((await ready()).check).toEqual({ state: 'not-checked' });
	});

	it('writes nothing in the person’s checkout: its branch, index and files are as they were', async () => {
		buttonOnTheme();
		g(mine, 'add', 'src/theme.ts');
		const theirs = () => ({
			head: g(mine, 'rev-parse', 'HEAD'),
			index: createHash('sha256')
				.update(readFileSync(join(mine, '.git', 'index')))
				.digest('hex'),
			status: g(mine, '--no-optional-locks', 'status', '--porcelain', '--untracked-files=all'),
			button: readFileSync(join(mine, 'src/Button/Button.ts'), 'utf8'),
		});
		const before = theirs();
		expect((await checked()).state).toBe('built');
		expect(theirs()).toEqual(before);
	});
});
