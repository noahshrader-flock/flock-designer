import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Check, PullRequest } from '../src/codeHost/changeRequests';
import type { ShareTools } from '../src/core/ports';
import { TOKENS, TOKEN_BRANCH, TokenBranches } from '../src/core/services/designSystem/tokenBranches';
import { proposalText } from '../src/core/services/designSystem/changeBranches';
import { g, gitFile, writeFiles } from './fixtures';

/** GitHub is a stand-in: nothing here is pushed anywhere or opened as a pull request. */

const REPOSITORY = 'acme/ui';
const THEME = {
	'src/colors/tones/brand.ts': "export const brand = {\n  50: '#108062',\n  20: '#18372F',\n};\n",
	'src/colors/theme/light.ts':
		"import { brand } from '../tones/brand';\n\nexport const lightPalette = {\n  mode: 'light',\n  primary: { main: brand[50] },\n};\n",
	'src/utils/theme.ts': 'const spacing = 8;\nexport const theme = createTheme({\n  shape: { borderRadius: 4 },\n});\n',
	'README.md': 'The library.\n',
};

let home: string;
let clone: string;
let file: string;
let asked: string[];
let checks: Check[];
let openPr: PullRequest | null;
/** `undefined` when GitHub cannot say. */
let stillOpen: boolean | undefined;

const commitAll = (root: string, message: string) => {
	g(root, 'add', '-A');
	g(root, 'commit', '-q', '-m', message);
};

const tools = (): ShareTools => ({
	push: async (branch) => (asked.push(`push ${branch}`), { pushed: true }),
	findPr: async (branch) => (asked.push(`find ${branch}`), openPr),
	createDraftPr: async (branch, title, body, base) => {
		asked.push(`draft ${branch} onto ${base} ${title}`);
		openPr = { number: 42, url: 'https://github.com/acme/ui/pull/42' };
		asked.push(body);
		return openPr;
	},
	isOpen: async () => {
		if (stillOpen === undefined) throw new Error('gh is signed out');
		return stillOpen;
	},
	checks: async () => checks,
	sleep: async () => undefined,
	now: () => 0,
});
const system = () => ({ id: REPOSITORY, name: 'Acme UI', repository: REPOSITORY, root: clone, folder: '', branch: 'develop' });
const branches = () => new TokenBranches({ system, file, tools, now: () => new Date('2026-10-09T12:00:00Z') });
const at = (ref: string, path: string) => gitFile(clone, ref, path);
const snapshot = () => ({
	head: g(clone, 'rev-parse', 'HEAD'),
	branch: g(clone, 'branch', '--show-current'),
	status: g(clone, 'status', '--porcelain', '--ignored'),
});

beforeEach(() => {
	home = mkdtempSync(join(tmpdir(), 'dsnr-token-branches-'));
	const upstream = join(home, 'upstream');
	clone = join(home, 'ui');
	file = join(home, 'app', 'token-branches.json');
	g(home, 'init', '-q', '--bare', '-b', 'develop', join(home, 'remote.git'));
	g(home, 'init', '-q', '-b', 'develop', upstream);
	writeFiles(upstream, THEME);
	commitAll(upstream, 'library');
	g(upstream, 'remote', 'add', 'origin', join(home, 'remote.git'));
	g(upstream, 'push', '-q', 'origin', 'develop');
	g(home, 'clone', '-q', join(home, 'remote.git'), clone);
	g(clone, 'config', 'user.name', 'Noah');
	g(clone, 'config', 'user.email', 'noah@example.com');
	g(clone, 'checkout', '-q', '-b', 'noah/work');
	writeFiles(clone, { 'README.md': 'Unsaved notes.\n' });
	asked = [];
	checks = [];
	openPr = null;
	stillOpen = true;
});
afterEach(() => rmSync(home, { recursive: true, force: true }));

describe('saving a change (T4)', () => {
	it('makes a branch of its own on the first save, one commit on the library’s develop, with the change in it', async () => {
		const b = await branches().save([{ path: 'tone.brand.50', value: '#0A6B52' }]);
		expect(b.branch).toMatch(TOKEN_BRANCH);
		expect(b.branch.startsWith('dsnr/tokens-20261009-')).toBe(true);
		expect(b).toMatchObject({ saves: 1, saved: [{ path: 'tone.brand.50', value: '#0A6B52' }], pullRequest: null });
		const develop = g(clone, 'rev-parse', 'origin/develop').trim();
		// The window is told the branch and the change, not the commits DSNR keeps to make its saves from.
		expect(Object.keys(b).sort()).toEqual(['branch', 'lines', 'pullRequest', 'saved', 'saves']);
		expect(g(clone, 'rev-parse', `${b.branch}^`).trim()).toBe(develop);
		expect(at(b.branch, 'src/colors/tones/brand.ts')).toContain("50: '#0A6B52'");
		expect(g(clone, 'diff', '--name-only', develop, b.branch).trim()).toBe('src/colors/tones/brand.ts');
		const message = g(clone, 'log', '-1', '--format=%B', b.branch);
		expect(message).toContain('Tones brand 50: #108062 → #0A6B52');
		expect(g(clone, 'log', '-1', '--format=%an <%ae>', b.branch).trim()).toBe('Noah <noah@example.com>');
	});

	it('leaves the person’s checkout as it was: the branch they are on, their uncommitted work, and their files', async () => {
		const before = snapshot();
		await branches().save([{ path: 'tone.brand.50', value: '#0A6B52' }]);
		expect(snapshot()).toEqual(before);
		expect(readFileSync(join(clone, 'README.md'), 'utf8')).toBe('Unsaved notes.\n');
		expect(readFileSync(join(clone, 'src/colors/tones/brand.ts'), 'utf8')).toContain("50: '#108062'");
	});

	it('makes each save one commit on the last, holding the whole change: a token reset since is back as the library has it', async () => {
		const first = await branches().save([
			{ path: 'tone.brand.50', value: '#0A6B52' },
			{ path: 'spacing', value: '6px' },
		]);
		const second = await branches().save([{ path: 'palette.light.primary.main', ref: 'tone.brand.20' }]);
		expect(second).toMatchObject({ branch: first.branch, saves: 2 });
		expect(g(clone, 'rev-list', '--count', `origin/develop..${second.branch}`).trim()).toBe('2');
		expect(at(second.branch, 'src/colors/theme/light.ts')).toContain('main: brand[20]');
		expect(at(second.branch, 'src/colors/tones/brand.ts')).toBe(THEME['src/colors/tones/brand.ts']);
		expect(at(second.branch, 'src/utils/theme.ts')).toBe(THEME['src/utils/theme.ts']);
	});

	it('makes no commit when a save would change nothing since the last', async () => {
		const edits = [{ path: 'tone.brand.50', value: '#0A6B52' }];
		const first = await branches().save(edits);
		const tip = g(clone, 'rev-parse', first.branch);
		const again = await branches().save(edits);
		expect(again.saves).toBe(1);
		expect(g(clone, 'rev-parse', first.branch)).toBe(tip);
	});

	it('refuses to save when there is nothing to save, or a change that would not read back, and makes no branch', async () => {
		await expect(branches().save([])).rejects.toThrow('no change to save');
		await expect(branches().save([{ path: 'tone.brand.50', value: 'red' }])).rejects.toThrow('not a hex color');
		expect(g(clone, 'branch', '--list', 'dsnr/*').trim()).toBe('');
	});

	it('never moves the branch from a commit it did not make: someone else’s work on it is kept', async () => {
		const b = await branches().save([{ path: 'tone.brand.50', value: '#0A6B52' }]);
		g(clone, 'update-ref', `refs/heads/${b.branch}`, g(clone, 'commit-tree', `${b.branch}^{tree}`, '-p', b.branch, '-m', 'by hand').trim());
		const theirs = g(clone, 'rev-parse', b.branch);
		await expect(branches().save([{ path: 'tone.brand.50', value: '#000000' }])).rejects.toThrow('has moved since DSNR last saved to it');
		expect(g(clone, 'rev-parse', b.branch)).toBe(theirs);
	});

	it('is remembered when the app is opened again, and forgotten, to start over, when asked or when the branch is gone', async () => {
		const b = await branches().save([{ path: 'tone.brand.50', value: '#0A6B52' }]);
		expect(await branches().current()).toMatchObject({ branch: b.branch, saved: [{ path: 'tone.brand.50', value: '#0A6B52' }] });
		branches().forget();
		expect(await branches().current()).toBeNull();
		// The branch stays: forgetting it only starts a new change.
		expect(g(clone, 'branch', '--list', b.branch).trim()).not.toBe('');
		const next = await branches().save([{ path: 'spacing', value: '6px' }]);
		expect(next.branch).not.toBe(b.branch);
		g(clone, 'branch', '-q', '-D', next.branch);
		expect(await branches().current()).toBeNull();
	});

	it('keeps the branch when git cannot read the clone, saying why, and has it again once it can', async () => {
		const b = await branches().save([{ path: 'tone.brand.50', value: '#0A6B52' }]);
		// The clone moved away for a moment (unmounted, renamed): git cannot look, which is not the branch being gone.
		renameSync(clone, `${clone}-away`);
		await expect(branches().current()).rejects.toThrow();
		renameSync(`${clone}-away`, clone);
		expect(await branches().current()).toMatchObject({ branch: b.branch });
		expect((await branches().save([{ path: 'spacing', value: '6px' }])).branch).toBe(b.branch);
	});

	it('writes only to a branch DSNR names as its own, whatever the file it keeps says', async () => {
		mkdirSync(dirname(file), { recursive: true });
		writeFileSync(file, JSON.stringify({ [REPOSITORY]: { branch: 'develop', base: 'x', tip: 'x', saved: [], saves: 1, pullRequest: null } }));
		expect(await branches().current()).toBeNull();
		const b = await branches().save([{ path: 'spacing', value: '6px' }]);
		expect(b.branch).toMatch(TOKEN_BRANCH);
		expect(g(clone, 'rev-parse', 'develop')).toBe(g(clone, 'rev-parse', 'origin/develop'));
	});
});

describe('proposing it (T5)', () => {
	it('pushes the branch and opens a draft pull request saying what changed', async () => {
		const b = await branches().save([
			{ path: 'tone.brand.50', value: '#0A6B52' },
			{ path: 'spacing', value: '6px' },
		]);
		const p = await branches().propose();
		expect(p.pullRequest).toEqual({ number: 42, url: 'https://github.com/acme/ui/pull/42', chromatic: null });
		expect(asked.slice(0, 3)).toEqual([
			`push ${b.branch}`,
			`find ${b.branch}`,
			`draft ${b.branch} onto develop Design tokens: Tones brand 50 and 1 more`,
		]);
		expect(asked[3]).toContain('- Tones brand 50: #108062 → #0A6B52');
		expect(asked[3]).toContain('- Spacing base: 8px → 6px');
		expect(asked[3]).toContain('Opened by DSNR as a draft');
	});

	it('says the pull request already open rather than open a second', async () => {
		await branches().save([{ path: 'tone.brand.50', value: '#0A6B52' }]);
		openPr = { number: 7, url: 'https://github.com/acme/ui/pull/7' };
		const p = await branches().propose();
		expect(p.pullRequest?.number).toBe(7);
		expect(asked.some((a) => a.startsWith('draft'))).toBe(false);
	});

	it('pushes every save after it is proposed, so the pull request has the last one', async () => {
		const b = await branches().save([{ path: 'tone.brand.50', value: '#0A6B52' }]);
		await branches().propose();
		asked = [];
		await branches().save([{ path: 'tone.brand.50', value: '#000000' }]);
		expect(asked).toEqual([`push ${b.branch}`]);
	});

	it('does not push a save before it is proposed', async () => {
		await branches().save([{ path: 'tone.brand.50', value: '#0A6B52' }]);
		await branches().save([{ path: 'tone.brand.50', value: '#000000' }]);
		expect(asked).toEqual([]);
	});

	it('finds Chromatic’s build among the pull request’s checks once the library’s CI has made one, and keeps it', async () => {
		await branches().save([{ path: 'tone.brand.50', value: '#0A6B52' }]);
		await branches().propose();
		expect((await branches().current())?.pullRequest?.chromatic).toBeNull();
		checks = [
			{ name: 'build', workflow: 'CI', bucket: 'pass', link: 'https://github.com/acme/ui/actions/runs/1', startedAt: '' },
			{ name: 'UI Tests', workflow: 'Chromatic', bucket: 'pending', link: 'https://www.chromatic.com/build?appId=a&number=3', startedAt: '' },
		];
		expect((await branches().current())?.pullRequest?.chromatic).toBe('https://www.chromatic.com/build?appId=a&number=3');
		checks = [];
		expect((await branches().current())?.pullRequest?.chromatic).toBe('https://www.chromatic.com/build?appId=a&number=3');
	});

	it('is forgotten once its pull request is merged or closed, and kept while GitHub cannot say', async () => {
		await branches().save([{ path: 'tone.brand.50', value: '#0A6B52' }]);
		await branches().propose();
		stillOpen = undefined;
		expect(await branches().current()).not.toBeNull();
		stillOpen = false;
		expect(await branches().current()).toBeNull();
		stillOpen = true;
		expect(await branches().scopes()).toEqual([]);
	});

	it('asks for a save first', async () => {
		await expect(branches().propose()).rejects.toThrow('Save the change to a branch first');
	});

	it('titles one change by its token', () => {
		expect(proposalText(TOKENS, ['Light primary main: brand 50 → brand 20']).title).toBe('Design tokens: Light primary main');
	});
});
