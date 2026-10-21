import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ConnectedDesignSystem, SplitCheck, SplitPreview } from '../src/shared/contract';
import { checkSplit, proposeSplit, splitPreview } from '../src/core/services/designSystem/split';
import { SplitBranches } from '../src/core/services/designSystem/splitBranches';
import { pushBranch } from '../src/core/services/platform/git';
import type { ShareTools } from '../src/core/ports';
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
let branches: SplitBranches;
/** The drafts opened, as GitHub would have them; `failing` makes the opening of that one (counted from 0) fail. */
let opened: { branch: string; title: string; body: string; base: string | undefined }[];
let closed: Set<number>;
let failing: number | null;

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
	opened = [];
	closed = new Set();
	failing = null;
	// The person's own git pushes, never forced, to the bare origin; only the pull requests are GitHub's, here a list.
	const tools = (root: string): ShareTools => ({
		push: (branch) => pushBranch(root, branch),
		findPr: async (branch) => {
			const i = opened.findIndex((o) => o.branch === branch);
			return i < 0 ? null : { number: i + 1, url: `https://github.com/o/ds/pull/${i + 1}` };
		},
		createDraftPr: async (branch, title, body, base) => {
			if (opened.length === failing) throw new Error('GitHub did not answer.');
			opened.push({ branch, title, body, base });
			return { number: opened.length, url: `https://github.com/o/ds/pull/${opened.length}` };
		},
		isOpen: async (n) => !closed.has(n),
		checks: async () => [],
		sleep: async () => undefined,
		now: () => Date.now(),
	});
	branches = new SplitBranches({ system: () => system, file: join(home, 'split-branches.json'), tools });
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

	describe('by the typecheck the repository declares, where it has no tsconfig.json', () => {
		/** The branch with its tsconfig.json gone and a typecheck declared, which the person's branch then starts from. */
		const declaring = (typecheck: string, written?: string) => {
			const other = join(home, 'other');
			g(home, 'clone', '-q', origin, other);
			rmSync(join(other, 'tsconfig.json'));
			writeFiles(other, {
				'.dsnr/workspace.json':
					written ??
					JSON.stringify({
						version: 1,
						product: 'ds',
						contextDir: '.dsnr',
						branchPattern: { codebase: 'feature/<project-id>' },
						designSystem: { package: 'ds' },
						commands: [{ id: 'typecheck', label: 'Typecheck', argv: ['node', '-e', typecheck] }],
					}),
			});
			commitAll(other, 'a declared typecheck');
			g(other, 'push', '-q', 'origin', 'develop');
			g(mine, 'fetch', '-q');
			g(mine, 'merge', '-q', '--ff-only', 'origin/develop');
		};

		it('checks with it where it passes on the branch', async () => {
			declaring("process.exit(require('fs').readFileSync('src/Chip/Chip.ts', 'utf8').includes('broken') ? 1 : 0)");
			buttonOnTheme();
			expect(await checked()).toMatchObject({ state: 'built', by: expect.stringMatching(/^its typecheck, node -e /) });
			write({ 'src/Chip/Chip.ts': 'export const Chip = 2; // broken\n' });
			expect((await checked()).state).toBe('fails');
		});

		it('says it cannot tell, where the branch already fails it: a new failure cannot be told from the old', async () => {
			declaring('process.exit(1)');
			buttonOnTheme();
			expect(await checked()).toEqual({
				state: 'unproven',
				why: 'its typecheck, node -e process.exit(1) already fails on develop, so whether your change adds to it cannot be told.',
			});
		});

		it('says its workspace file cannot be read, never that it declares nothing', async () => {
			declaring('', '{ not json');
			buttonOnTheme();
			const check = await checked();
			expect(check.state === 'unproven' && check.why).toMatch(
				/^\.dsnr\/workspace\.json is not valid JSON: .* So whether each builds cannot be checked\.$/,
			);
		});
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

describe('the split, proposed: a branch and a draft for each, never the person’s own', () => {
	const propose = async (confirmed = false) => proposeSplit(proof, branches, system, (await ready()).seen, confirmed);
	/** What a branch changes on the commit it stands on, from the bare origin GitHub stands in for. */
	const changes = (branch: string, parent: string) => g(origin, 'diff', '--name-only', parent, branch).split('\n').filter(Boolean);

	it('makes one for each in merge order, each onto what it stands on, with only its own files', async () => {
		buttonOnTheme();
		await checked();
		const proposal = await propose();
		expect(proposal.opened).toBe(3);
		expect(proposal.parts.map((p) => [p.name, p.on])).toEqual([
			['src/theme.ts', null],
			['Chip', null],
			['Button', 0],
		]);
		const [theme, chip, button] = proposal.parts.map((p) => p.branch) as [string, string, string];
		expect(opened.map((o) => [o.branch, o.base, o.title])).toEqual([
			[theme, 'develop', 'src/theme.ts: from feature'],
			[chip, 'develop', 'Chip: from feature'],
			[button, theme, 'Button: from feature'],
		]);
		expect(changes(theme, 'develop')).toEqual(['src/theme.ts']);
		expect(changes(chip, 'develop')).toEqual(['src/Chip/Chip.ts']);
		expect(changes(button, theme)).toEqual(['src/Button/Button.ts']);
		expect(opened[2]!.body).toContain('Onto src/theme.ts’s pull request: it does not build without it, so merge that first.');
		expect(opened[2]!.body).toContain('Checked: it builds on what it stands on, by TypeScript, against its tsconfig.json, with no new error.');
	});

	it('leaves the person’s branch, index and files as they were', async () => {
		buttonOnTheme();
		g(mine, 'add', 'src/theme.ts');
		const theirs = () => ({
			head: g(mine, 'rev-parse', 'HEAD'),
			branch: g(mine, 'rev-parse', '--abbrev-ref', 'HEAD'),
			index: createHash('sha256')
				.update(readFileSync(join(mine, '.git', 'index')))
				.digest('hex'),
			status: g(mine, '--no-optional-locks', 'status', '--porcelain', '--untracked-files=all'),
		});
		await checked();
		const before = theirs();
		await propose();
		expect(theirs()).toEqual(before);
	});

	it('refuses edits changed since they were checked, and one not checked, making nothing', async () => {
		buttonOnTheme();
		await expect(propose()).rejects.toThrow('Check that they build first; then they can be proposed.');
		await checked();
		const seen = (await ready()).seen;
		write({ 'src/Chip/Chip.ts': 'export const Chip = 3;\n' });
		await expect(proposeSplit(proof, branches, system, seen, false)).rejects.toThrow('Your edits have changed since they were checked');
		expect(opened).toEqual([]);
		expect(g(mine, 'for-each-ref', '--format=%(refname)', 'refs/heads/dsnr/')).toBe('');
	});

	it('sends one not shown to build only on purpose, each onto the branch', async () => {
		unlinkSync(join(mine, 'node_modules'));
		buttonOnTheme();
		expect((await checked()).state).toBe('unproven');
		await expect(propose()).rejects.toThrow('propose them anyway, on purpose');
		const proposal = await propose(true);
		expect(proposal.parts.map((p) => p.on)).toEqual([null, null, null]);
		expect(opened[0]!.body).toContain('Not checked: Its packages are not installed');
	});

	it('stops partway with every branch made and recorded, and Continue opens the rest, never one twice', async () => {
		buttonOnTheme();
		await checked();
		failing = 1;
		await expect(propose()).rejects.toThrow('1 of 3 opened. Chip: GitHub did not answer. Continue opens the rest.');
		const stopped = await branches.current();
		expect(stopped?.opened).toBe(1);
		expect(g(mine, 'for-each-ref', '--format=%(refname:short)', 'refs/heads/dsnr/').split('\n')).toHaveLength(3);
		failing = null;
		// Edited since: Continue still opens what was checked, from the commits made then.
		write({ 'src/Chip/Chip.ts': 'export const Chip = 9;\n' });
		expect((await branches.open()).opened).toBe(3);
		expect(opened.map((o) => o.title)).toEqual(['src/theme.ts: from feature', 'Chip: from feature', 'Button: from feature']);
		expect(g(origin, 'show', `${stopped!.parts[1]!.branch}:src/Chip/Chip.ts`)).toBe('export const Chip = 2;');
	});

	it('is refused, never forced, where someone moved a branch on GitHub before it was opened', async () => {
		buttonOnTheme();
		await checked();
		failing = 0;
		await expect(propose()).rejects.toThrow('0 of 3 opened.');
		const theme = (await branches.current())!.parts[0]!.branch;
		const other = join(home, 'other');
		g(home, 'clone', '-q', origin, other);
		g(other, 'checkout', '-q', theme);
		writeFiles(other, { 'src/theme.ts': 'export const gap = 1;\nexport const size = 2;\n// Reviewed.\n' });
		commitAll(other, 'a reviewer');
		const theirs = g(other, 'rev-parse', 'HEAD');
		g(other, 'push', '-q', 'origin', theme);
		failing = null;
		await expect(branches.open()).rejects.toThrow('has changes on the remote that this machine does not have, so it was not pushed');
		expect(g(origin, 'rev-parse', theme)).toBe(theirs);
	});

	it('tells a reviewer’s commit on top from a rewrite, and a rewrite of the same change from a different one', async () => {
		buttonOnTheme();
		await checked();
		const proposal = await propose();
		const [theme, chip, button] = proposal.parts.map((p) => p.branch) as [string, string, string];
		const other = join(home, 'other');
		g(home, 'clone', '-q', origin, other);
		g(other, 'config', 'user.name', 'A Reviewer');
		g(other, 'checkout', '-q', chip);
		writeFiles(other, { 'src/Chip/Chip.ts': 'export const Chip = 2;\n// Reviewed.\n' });
		commitAll(other, 'review');
		g(other, 'push', '-q', 'origin', chip);
		g(other, 'checkout', '-q', button);
		writeFiles(other, { 'src/Button/Button.ts': "import { gap, size } from '../theme';\nexport const Button = gap * size;\n" });
		g(other, 'commit', '-q', '-a', '--amend', '--no-edit');
		g(other, 'push', '-q', '-f', 'origin', button);
		// The same change, its message reworded: rewritten, and the change is the same.
		g(other, 'checkout', '-q', theme);
		g(other, 'commit', '-q', '--amend', '-m', 'theme.ts, reworded');
		g(other, 'push', '-q', '-f', 'origin', theme);
		const read = await branches.current();
		expect(read?.parts.map((p) => p.divergence)).toEqual([
			{ state: 'rewritten', sameChange: true, files: [] },
			{ state: 'added', commits: 1, by: ['A Reviewer'], files: ['src/Chip/Chip.ts'] },
			{ state: 'rewritten', sameChange: false, files: ['src/Button/Button.ts'] },
		]);
	});

	it('is absorbed by the person’s branch once merged: their change rebases to nothing left, with no conflict', async () => {
		buttonOnTheme();
		await checked();
		const proposal = await propose();
		// Squash-merged in the order proposed, as a reviewer would.
		const merger = join(home, 'merger');
		g(home, 'clone', '-q', origin, merger);
		for (const part of proposal.parts) {
			g(merger, 'merge', '-q', '--squash', `origin/${part.branch}`);
			g(merger, 'commit', '-q', '-m', `${part.name} (#pr)`);
		}
		g(merger, 'push', '-q', 'origin', 'develop');
		commitAll(mine, 'my change');
		g(mine, 'fetch', '-q');
		g(mine, 'rebase', '-q', 'origin/develop');
		expect(g(mine, 'rev-list', '--count', 'origin/develop..HEAD')).toBe('0');
	});

	it('starts over by forgetting it and removing only branches never pushed; what is on GitHub stays', async () => {
		buttonOnTheme();
		await checked();
		failing = 1;
		await expect(propose()).rejects.toThrow('1 of 3 opened.');
		const parts = (await branches.current())!.parts;
		await branches.startOver();
		expect(await branches.current()).toBeNull();
		expect(g(mine, 'for-each-ref', '--format=%(refname:short)', 'refs/heads/dsnr/')).toBe(parts[0]!.branch);
		expect(g(origin, 'rev-parse', '--verify', '--quiet', parts[0]!.branch)).not.toBe('');
	});

	it('is forgotten once none of its drafts is open', async () => {
		buttonOnTheme();
		await checked();
		await propose();
		closed = new Set([1, 2, 3]);
		expect(await branches.current()).toBeNull();
	});
});
