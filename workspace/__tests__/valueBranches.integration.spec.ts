import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { PullRequest } from '../src/host/changeRequests';
import type { ShareTools } from '../src/main/services/share';
import { ValueBranches } from '../src/main/services/valueBranches';
import type { TriedValue, ValueSources as Answer } from '../src/shared/contract';
import { g } from './fixtures';

/**
 * Keeping the values tried on a component on a branch, and proposing them (Phase 4.4), against a real clone of a small
 * library, as a change to the tokens is kept. Where each value is written is a stand-in, said as `ValueSources` says it;
 * GitHub is a stand-in too: nothing is pushed anywhere or opened as a pull request.
 */
const BUTTON = 'src/components/FSButton/FSButton.stories.tsx';
const BADGE = 'src/components/FSBadge/FSBadge.stories.tsx';
const THEME = "export const sizes = {\n  sm: { height: '28px' },\n  md: { height: '36px' },\n};\n";
const LIBRARY = {
	'src/utils/theme.ts': THEME,
	'src/components/FSBadge/badge.module.css': '.badge {\n  border-radius: 20px;\n}\n',
	'README.md': 'The library.\n',
};

let home: string;
let clone: string;
let upstream: string;
let file: string;
let asked: string[];
let openPr: PullRequest | null;
/** Where the stand-in says each component's values are written, and the files that writes, or why it cannot be. */
let found: Map<string, { answer: Answer; files: Map<string, string> | Error }>;

const write = (root: string, files: Record<string, string>) => {
	for (const [path, text] of Object.entries(files)) {
		mkdirSync(dirname(join(root, path)), { recursive: true });
		writeFileSync(join(root, path), text);
	}
};
const tools = (): ShareTools => ({
	push: async (branch) => (asked.push(`push ${branch}`), { pushed: true }),
	findPr: async () => openPr,
	createDraftPr: async (branch, title, body) => {
		asked.push(`draft ${branch} ${title}`, body);
		openPr = { number: 7, url: 'https://github.com/acme/ui/pull/7' };
		return openPr;
	},
	checks: async () => [],
	sleep: async () => undefined,
	now: () => 0,
});
const system = () => ({ id: 'acme/ui', name: 'Acme UI', repository: 'acme/ui', root: clone, folder: '', branch: 'develop' });
const sources = {
	of: async (scope: string) => found.get(scope)?.answer ?? ({ state: 'building' } as const),
	files: async (scope: string) => {
		const files = found.get(scope)?.files;
		if (files === undefined) throw new Error('Where the values are written is still being found; save once it is.');
		if (files instanceof Error) throw files;
		return files;
	},
};
const branches = () => new ValueBranches({ system, file, tools, sources, now: () => new Date('2026-10-16T12:00:00Z') });

const SMALL: TriedValue = { property: 'height', value: '32px', targets: ['Sm#1', 'Sm#2'] };
const smallFound = (writes = '32px'): { answer: Answer; files: Map<string, string> } => ({
	answer: {
		state: 'ready',
		values: [{ id: 'height\u0000Sm#1\u0001Sm#2', state: 'found', places: [{ file: 'src/utils/theme.ts', line: 2, written: '28px', writes }] }],
		reach: { state: 'none' },
	},
	files: new Map([['src/utils/theme.ts', THEME.replace("sm: { height: '28px' }", `sm: { height: '${writes}' }`)]]),
});

beforeEach(() => {
	home = mkdtempSync(join(tmpdir(), 'dsnr-value-branches-'));
	upstream = join(home, 'upstream');
	clone = join(home, 'ui');
	file = join(home, 'app', 'value-branches.json');
	g(home, 'init', '-q', '--bare', '-b', 'develop', join(home, 'remote.git'));
	g(home, 'init', '-q', '-b', 'develop', upstream);
	write(upstream, LIBRARY);
	g(upstream, 'add', '-A');
	g(upstream, 'commit', '-q', '-m', 'library');
	g(upstream, 'remote', 'add', 'origin', join(home, 'remote.git'));
	g(upstream, 'push', '-q', 'origin', 'develop');
	g(home, 'clone', '-q', join(home, 'remote.git'), clone);
	g(clone, 'config', 'user.name', 'Noah');
	g(clone, 'config', 'user.email', 'noah@example.com');
	g(clone, 'checkout', '-q', '-b', 'noah/work');
	write(clone, { 'README.md': 'Unsaved notes.\n' });
	asked = [];
	openPr = null;
	found = new Map([[BUTTON, smallFound()]]);
});
afterEach(() => rmSync(home, { recursive: true, force: true }));

describe('saving the values tried on a component (Phase 4.4)', () => {
	it('makes a branch of its own for the component, one commit on develop changing only where the value was found', async () => {
		const status = g(clone, 'status', '--porcelain').trim();
		const saved = await branches().save([SMALL], BUTTON);
		expect(saved).toEqual({ branch: expect.stringMatching(/^dsnr\/values-20261016-[0-9a-f]{4}$/), saved: [SMALL], saves: 1, pullRequest: null });
		expect(g(clone, 'diff', '--name-only', 'origin/develop', saved.branch).trim()).toBe('src/utils/theme.ts');
		expect(g(clone, 'show', `${saved.branch}:src/utils/theme.ts`)).toContain("sm: { height: '32px' }");
		expect(g(clone, 'log', '-1', '--format=%B', saved.branch).trim()).toBe(
			'Component values: 1 changed\n\nFSButton · Height: 28px → 32px (src/utils/theme.ts, line 2)\n\nSaved from DSNR.',
		);
		// The person's checkout is as it was: their branch, their unsaved work.
		expect(g(clone, 'branch', '--show-current').trim()).toBe('noah/work');
		expect(g(clone, 'status', '--porcelain').trim()).toBe(status);
		// Kept for that component alone: another has none.
		expect(await branches().current(BUTTON)).toEqual(saved);
		expect(await branches().current(BADGE)).toBeNull();
	});

	it('saves again on the same branch, the whole change each time', async () => {
		const first = await branches().save([SMALL], BUTTON);
		found.set(BUTTON, smallFound('40px'));
		const second = await branches().save([{ ...SMALL, value: '40px' }], BUTTON);
		expect(second).toMatchObject({ branch: first.branch, saves: 2 });
		expect(g(clone, 'show', `${second.branch}:src/utils/theme.ts`)).toContain("sm: { height: '40px' }");
		expect(g(clone, 'rev-list', '--count', `origin/develop..${second.branch}`).trim()).toBe('2');
	});

	it('saves nothing, and makes no branch, for a value that cannot be saved, saying why', async () => {
		found.set(BUTTON, { ...smallFound(), files: new Error('28px is not written in the design system’s own files for it.') });
		await expect(branches().save([SMALL], BUTTON)).rejects.toThrow('not written');
		expect(g(clone, 'branch', '--list', 'dsnr/*').trim()).toBe('');
		expect(await branches().current(BUTTON)).toBeNull();
	});

	it('is not saved on top of a first save the library has moved on from: started over, it is saved on the library as it is', async () => {
		await branches().save([SMALL], BUTTON);
		write(upstream, { 'README.md': 'Moved.\n' });
		g(upstream, 'commit', '-q', '-am', 'moved');
		g(upstream, 'push', '-q', 'origin', 'develop');
		g(clone, 'fetch', '-q', 'origin');
		await expect(branches().save([{ ...SMALL, value: '40px' }], BUTTON)).rejects.toThrow('The library has moved since this was first saved');
		branches().forget(BUTTON);
		const again = await branches().save([SMALL], BUTTON);
		expect(g(clone, 'merge-base', 'origin/develop', again.branch).trim()).toBe(g(clone, 'rev-parse', 'origin/develop').trim());
	});

	it('proposes a draft pull request saying what the last save said, even while where it is written is found again', async () => {
		await branches().save([SMALL], BUTTON);
		// The app opened again: where the values are written is being found once more.
		found.delete(BUTTON);
		const proposed = await branches().propose(BUTTON);
		expect(proposed.pullRequest).toEqual({ number: 7, url: 'https://github.com/acme/ui/pull/7', chromatic: null });
		expect(asked[0]).toMatch(/^push dsnr\/values-/);
		expect(asked[1]).toMatch(/^draft dsnr\/values-\d{8}-[0-9a-f]{4} Component values: FSButton · Height$/);
		expect(asked[2]).toContain('- FSButton · Height: 28px → 32px (src/utils/theme.ts, line 2)');
	});
});
