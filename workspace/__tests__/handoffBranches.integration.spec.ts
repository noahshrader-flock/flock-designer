import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HandoffBranches } from '../src/main/services/handoffBranches';
import type { ShareTools } from '../src/main/services/share';
import type { ConnectedDesignSystem } from '../src/shared/contract';

/**
 * Process changes in the core (PROCESS_CHANGES_PLAN Phase 1): a unit handed to Claude Code on a branch DSNR names, found and
 * read from git, and proposed as a draft pull request only as the rules allow. Against a real clone; GitHub is the tools'.
 */

let home: string;
let clone: string;
let system: ConnectedDesignSystem;
let pushed: string[];
let opened: { branch: string; title: string; body: string }[];
let saved: boolean;
const BUTTON = 'src/components/FSButton/FSButton.stories.tsx';
const g = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

const tools = (): ShareTools => ({
	push: async (branch) => (pushed.push(branch), { pushed: true }),
	findPr: async () => null,
	createDraftPr: async (branch, title, body) => (opened.push({ branch, title, body }), { number: 7, url: 'https://github.com/o/ui/pull/7' }),
	checks: async () => [],
	sleep: async () => undefined,
	now: () => 0,
});
const handoffs = () =>
	new HandoffBranches({
		system: () => system,
		file: join(home, 'app', 'handoffs.json'),
		tools,
		rules: async () => '1. Its own source only.',
		changes: async () => [{ said: 'FSButton · Height · sm: 28px → 32px', where: 'theme.ts, line 1' }],
		reach: async () => 'It moves 1 component (FSButton); 40 unchanged, in their stories drawn.',
		saved: async () => saved,
		now: () => new Date('2026-10-17T12:00:00Z'),
	});
const TRIED = { tried: [{ property: 'height' as const, value: '32px', targets: ['a'] }] };
/** What Claude Code does with the prompt: the branch it names, from the base, a commit on it. */
const claudeCommits = (branch: string, files: Record<string, string>) => {
	g(clone, 'switch', '-q', '-c', branch, 'origin/develop');
	for (const [file, text] of Object.entries(files)) writeFileSync(join(clone, file), text);
	g(clone, 'add', '-A');
	g(clone, 'commit', '-q', '-m', 'Claude Code: taller small');
	g(clone, 'switch', '-q', 'develop');
};

beforeEach(() => {
	home = mkdtempSync(join(tmpdir(), 'dsnr-handoffs-'));
	const upstream = join(home, 'upstream');
	clone = join(home, 'ui');
	g(home, 'init', '-q', '--bare', '-b', 'develop', join(home, 'remote.git'));
	mkdirSync(upstream);
	g(upstream, 'init', '-q', '-b', 'develop');
	g(upstream, 'config', 'user.name', 'Noah');
	g(upstream, 'config', 'user.email', 'noah@example.com');
	writeFileSync(join(upstream, 'theme.ts'), 'export const height = 28;\n');
	mkdirSync(join(upstream, '.github'));
	writeFileSync(join(upstream, '.github', 'pull_request_template.md'), '## Testing\n\n- [ ] Checked in Storybook\n');
	g(upstream, 'add', '-A');
	g(upstream, 'commit', '-q', '-m', 'library');
	g(upstream, 'remote', 'add', 'origin', join(home, 'remote.git'));
	g(upstream, 'push', '-q', 'origin', 'develop');
	g(home, 'clone', '-q', join(home, 'remote.git'), clone);
	g(clone, 'config', 'user.name', 'Noah');
	g(clone, 'config', 'user.email', 'noah@example.com');
	system = { id: 'o/ui', name: 'UI', repository: 'o/ui', root: clone, folder: '', branch: 'develop' };
	pushed = [];
	opened = [];
	saved = false;
});
afterEach(() => rmSync(home, { recursive: true, force: true }));

describe('a unit handed to Claude Code', () => {
	it('names its branch, keeps it, and gives the prompt to open Claude Code with in the library’s root', async () => {
		const started = await handoffs().start(BUTTON, TRIED);
		expect(started.root).toBe(clone);
		expect(started.branch).toMatch(/^dsnr\/handoff-20261017-[0-9a-f]{4}$/);
		expect(started.prompt).toContain(`git switch -c ${started.branch} origin/develop`);
		expect(started.prompt).toContain('for the FSButton component alone.');
		expect(started.prompt).toContain('- FSButton · Height · sm: 28px → 32px (theme.ts, line 1)');
		// Kept, and read from git: not made yet.
		expect(await handoffs().current(BUTTON)).toEqual({
			branch: started.branch,
			lines: ['FSButton · Height · sm: 28px → 32px (theme.ts, line 1)'],
			review: { state: 'missing' },
			pullRequest: null,
		});
		expect(handoffs().scopes()).toEqual([BUTTON]);
	});

	it('is refused on a checkout with unfinished work, with a branch DSNR saved, and when it is handed over already', async () => {
		writeFileSync(join(clone, 'notes.md'), 'mine\n');
		await expect(handoffs().start(BUTTON, TRIED)).rejects.toThrow('changed or new and not committed');
		rmSync(join(clone, 'notes.md'));
		saved = true;
		await expect(handoffs().start(BUTTON, TRIED)).rejects.toThrow('This has a branch DSNR saved it to.');
		saved = false;
		await handoffs().start(BUTTON, TRIED);
		await expect(handoffs().start(BUTTON, TRIED)).rejects.toThrow('This is handed to Claude Code already.');
		// Another unit is its own: the tokens can be handed over beside it.
		expect((await handoffs().start('', { edits: [] })).prompt).toContain('for its design tokens.');
	});

	it('is proposed once Claude Code has committed on its branch: pushed, a draft with the lines, the reach, what was checked and the template', async () => {
		const { branch } = await handoffs().start(BUTTON, TRIED);
		await expect(handoffs().propose(BUTTON, false)).rejects.toThrow(`There is no branch ${branch} yet`);
		claudeCommits(branch, { 'theme.ts': 'export const height = 32;\n' });
		const proposed = await handoffs().propose(BUTTON, false);
		expect(pushed).toEqual([branch]);
		expect(proposed.pullRequest).toEqual({ number: 7, url: 'https://github.com/o/ui/pull/7' });
		const [pr] = opened;
		expect(pr?.title).toBe('FSButton: 1 change from DSNR');
		expect(pr?.body).toContain('- FSButton · Height · sm: 28px → 32px (theme.ts, line 1)');
		expect(pr?.body).toContain('It moves 1 component (FSButton)');
		expect(pr?.body).toContain('made from develop; 1 commit; 1 file, 2 lines changed.');
		expect(pr?.body).toContain('## Testing\n\n- [ ] Checked in Storybook');
		expect((await handoffs().current(BUTTON))?.pullRequest?.number).toBe(7);
	});

	it('proposes a flagged branch only when it is sent on purpose, and says so in its description', async () => {
		const { branch } = await handoffs().start(BUTTON, TRIED);
		claudeCommits(branch, { 'theme.ts': 'export const height = 32;\n', 'Button.stories.tsx': 'export default {};\n' });
		await expect(handoffs().propose(BUTTON, false)).rejects.toThrow('send it on purpose');
		expect(pushed).toEqual([]);
		await handoffs().propose(BUTTON, true);
		expect(opened[0]?.body).toContain('on purpose: Button.stories.tsx (a story).');
	});

	it('is forgotten on start over, leaving its branch, so it can be handed over again', async () => {
		const { branch } = await handoffs().start(BUTTON, TRIED);
		claudeCommits(branch, { 'theme.ts': 'export const height = 32;\n' });
		handoffs().forget(BUTTON);
		expect(await handoffs().current(BUTTON)).toBeNull();
		expect(g(clone, 'branch', '--list', branch)).toContain(branch);
		await handoffs().start(BUTTON, TRIED);
	});
});
