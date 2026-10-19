import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HandOverBranches } from '../src/core/services/designSystem/handOverBranches';
import type { ShareTools } from '../src/core/ports';
import type { ConnectedDesignSystem } from '../src/shared/contract';

let home: string;
let clone: string;
let system: ConnectedDesignSystem;
let pushed: string[];
let opened: { branch: string; title: string; body: string; base: string | undefined }[];
let saved: boolean;
let stillOpen: boolean;
const BUTTON = 'src/components/FSButton/FSButton.stories.tsx';
const g = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

const tools = (): ShareTools => ({
	push: async (branch) => (pushed.push(branch), { pushed: true }),
	findPr: async () => null,
	createDraftPr: async (branch, title, body, base) => (
		opened.push({ branch, title, body, base }),
		{ number: 7, url: 'https://github.com/o/ui/pull/7' }
	),
	isOpen: async () => stillOpen,
	checks: async () => [],
	sleep: async () => undefined,
	now: () => 0,
});
const handOvers = () =>
	new HandOverBranches({
		system: () => system,
		file: join(home, 'app', 'handoffs.json'),
		tools,
		rules: async () => '1. Its own source only.',
		changes: async () => [{ said: 'FSButton · Height · sm: 28px → 32px', where: 'theme.ts, line 1' }],
		reach: async () => 'It moves 1 component (FSButton); 40 unchanged, in their stories drawn.',
		saved: async () => saved,
		now: () => new Date('2026-10-17T12:00:00Z'),
	});
const tipOf = (branch: string) => g(clone, 'rev-parse', branch);
const SEEN = 'a'.repeat(40);
const TRIED = { tried: [{ property: 'height' as const, value: '32px', targets: ['a'] }] };
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
	stillOpen = true;
});
afterEach(() => rmSync(home, { recursive: true, force: true }));

describe('a unit handed to Claude Code', () => {
	it('names its branch, keeps it, and gives the prompt to open Claude Code with in the library’s root', async () => {
		const started = await handOvers().start(BUTTON, TRIED);
		expect(started.root).toBe(clone);
		expect(started.branch).toMatch(/^dsnr\/handoff-20261017-[0-9a-f]{4}$/);
		expect(started.prompt).toContain(`git switch -c ${started.branch} origin/develop`);
		expect(started.prompt).toContain('for the FSButton component alone.');
		expect(started.prompt).toContain('- FSButton · Height · sm: 28px → 32px (theme.ts, line 1)');
		expect(await handOvers().current(BUTTON)).toEqual({
			branch: started.branch,
			saved: TRIED,
			lines: ['FSButton · Height · sm: 28px → 32px (theme.ts, line 1)'],
			saves: 0,
			review: { state: 'missing' },
			pullRequest: null,
		});
		expect(await handOvers().scopes()).toEqual([BUTTON]);
	});

	it('is refused on a checkout with unfinished work, with a branch DSNR saved, and when it is handed over already', async () => {
		writeFileSync(join(clone, 'notes.md'), 'mine\n');
		await expect(handOvers().start(BUTTON, TRIED)).rejects.toThrow('changed or new and not committed');
		rmSync(join(clone, 'notes.md'));
		saved = true;
		await expect(handOvers().start(BUTTON, TRIED)).rejects.toThrow('This has a branch DSNR saved it to.');
		saved = false;
		await handOvers().start(BUTTON, TRIED);
		await expect(handOvers().start(BUTTON, TRIED)).rejects.toThrow('This is handed to Claude Code already.');
		// Another unit is its own: the tokens can be handed over beside it.
		expect((await handOvers().start('', { edits: [] })).prompt).toContain('for its design tokens.');
	});

	it('is proposed once Claude Code has committed on its branch: pushed, a draft with the lines, the reach, what was checked and the template', async () => {
		const { branch } = await handOvers().start(BUTTON, TRIED);
		await expect(handOvers().propose(BUTTON, SEEN, false)).rejects.toThrow(`There is no branch ${branch} yet`);
		claudeCommits(branch, { 'theme.ts': 'export const height = 32;\n' });
		const proposed = await handOvers().propose(BUTTON, tipOf(branch), false);
		expect(pushed).toEqual([branch]);
		expect(proposed.pullRequest).toEqual({ number: 7, url: 'https://github.com/o/ui/pull/7', chromatic: null });
		const [pr] = opened;
		// Onto the branch it was made from, never the repository's default by chance.
		expect(pr?.base).toBe('develop');
		expect(pr?.title).toBe('FSButton: 1 change from DSNR');
		expect(pr?.body).toContain('- FSButton · Height · sm: 28px → 32px (theme.ts, line 1)');
		expect(pr?.body).toContain('It moves 1 component (FSButton)');
		expect(pr?.body).toContain('made from develop; 1 commit; 1 file, 2 lines changed.');
		expect(pr?.body).toContain('## Testing\n\n- [ ] Checked in Storybook');
		expect((await handOvers().current(BUTTON))?.pullRequest?.number).toBe(7);
	});

	it('proposes a flagged branch only when it is sent on purpose, and says so in its description', async () => {
		const { branch } = await handOvers().start(BUTTON, TRIED);
		claudeCommits(branch, { 'theme.ts': 'export const height = 32;\n', 'Button.stories.tsx': 'export default {};\n' });
		await expect(handOvers().propose(BUTTON, tipOf(branch), false)).rejects.toThrow('send it on purpose');
		expect(pushed).toEqual([]);
		await handOvers().propose(BUTTON, tipOf(branch), true);
		expect(opened[0]?.body).toContain('on purpose: Button.stories.tsx (a story).');
	});

	it('proposes only the commit the person looked at: one Claude Code committed since is refused, and nothing is pushed', async () => {
		const { branch } = await handOvers().start(BUTTON, TRIED);
		claudeCommits(branch, { 'theme.ts': 'export const height = 32;\n' });
		const seen = tipOf(branch);
		g(clone, 'switch', '-q', branch);
		writeFileSync(join(clone, 'package.json'), '{}\n');
		g(clone, 'add', '-A');
		g(clone, 'commit', '-q', '-m', 'Claude Code: one more');
		g(clone, 'switch', '-q', 'develop');
		await expect(handOvers().propose(BUTTON, seen, true)).rejects.toThrow(`has committed on ${branch} since it was shown here`);
		expect(pushed).toEqual([]);
	});

	it('is forgotten once its pull request is merged or closed, as every change is', async () => {
		const { branch } = await handOvers().start(BUTTON, TRIED);
		claudeCommits(branch, { 'theme.ts': 'export const height = 32;\n' });
		await handOvers().propose(BUTTON, tipOf(branch), false);
		stillOpen = false;
		expect(await handOvers().current(BUTTON)).toBeNull();
		expect(await handOvers().scopes()).toEqual([]);
	});

	it('is forgotten on start over, leaving its branch, so it can be handed over again', async () => {
		const { branch } = await handOvers().start(BUTTON, TRIED);
		claudeCommits(branch, { 'theme.ts': 'export const height = 32;\n' });
		handOvers().forget(BUTTON);
		expect(await handOvers().current(BUTTON)).toBeNull();
		expect(g(clone, 'branch', '--list', branch)).toContain(branch);
		await handOvers().start(BUTTON, TRIED);
	});
});
