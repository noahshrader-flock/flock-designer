import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { unfinishedWork } from '../src/core/services/checkoutClean';

/**
 * Process changes starts Claude Code only on a design system checkout with no unfinished work (PROCESS_CHANGES_PLAN Phase 1),
 * so its edits never mix with the person's: each case against a real repository.
 */

let root: string;
const g = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const write = (file: string, text: string) => writeFileSync(join(root, file), text);

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), 'dsnr-checkout-clean-'));
	g('init', '-q', '-b', 'develop');
	g('config', 'user.name', 'Noah');
	g('config', 'user.email', 'noah@example.com');
	write('theme.ts', 'export const radius = 8;\n');
	g('add', '-A');
	g('commit', '-q', '-m', 'library');
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('a design system checkout handed to Claude Code', () => {
	it('is ready with nothing unfinished, on a branch', async () => {
		expect(await unfinishedWork(root)).toBeNull();
	});

	it('is not with a change to a file, or a new one, which Claude Code’s commit would sweep in', async () => {
		write('theme.ts', 'export const radius = 12;\n');
		expect(await unfinishedWork(root)).toContain('1 file is changed or new and not committed. Commit or stash them first');
		write('notes.md', 'mine\n');
		expect(await unfinishedWork(root)).toContain('2 files are changed or new');
	});

	it('counts a new file even when the clone is set to hide them from its status', async () => {
		g('config', 'status.showUntrackedFiles', 'no');
		write('notes.md', 'mine\n');
		expect(await unfinishedWork(root)).toContain('1 file is changed or new');
	});

	it('is not in the middle of a merge', async () => {
		g('switch', '-q', '-c', 'other');
		write('theme.ts', 'export const radius = 10;\n');
		g('commit', '-qam', 'other');
		g('switch', '-q', 'develop');
		write('theme.ts', 'export const radius = 6;\n');
		g('commit', '-qam', 'develop');
		try {
			g('merge', 'other');
		} catch {
			// The conflict leaves the merge unfinished, as a person would have it.
		}
		// What it is in the middle of is said, not the conflicted file it leaves.
		expect(await unfinishedWork(root)).toBe('The design system’s checkout is in the middle of a merge. Finish it or abort it first.');
	});

	it('is not on a detached HEAD', async () => {
		g('checkout', '-q', '--detach');
		expect(await unfinishedWork(root)).toBe('The design system’s checkout is not on a branch (a detached HEAD). Switch to a branch first.');
	});
});
