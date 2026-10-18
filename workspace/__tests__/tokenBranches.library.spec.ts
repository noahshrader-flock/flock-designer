import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import type { ShareTools } from '../src/core/services/share';
import { TokenBranches } from '../src/core/services/tokenBranches';
import { g } from './fixtures';
import { REAL_FUI, REAL_LIBRARY as REAL, describeWith, libraryMissing, realDevelop } from './realCheckouts';

let home: string;
beforeEach(() => void (home = mkdtempSync(join(tmpdir(), 'dsnr-token-branches-'))));
afterEach(() => rmSync(home, { recursive: true, force: true }));

/** Saving shares nothing: a stand-in that refuses, so a save that tried would fail. */
const refused = async (): Promise<never> => {
	throw new Error('nothing is shared when a change is saved');
};
const NOTHING_SHARED: ShareTools = {
	push: refused,
	findPr: refused,
	createDraftPr: refused,
	checks: refused,
	sleep: async () => undefined,
	now: () => 0,
};

/** The real library, read where it is and saved to in a throwaway clone of it: the person's clone is never written to. */

describeWith(libraryMissing, 'saving a change to the real library', () => {
	it('commits a tone, a role pointed at another step and the spacing on its develop, each file as the library writes it', async () => {
		const throwaway = join(home, 'fui');
		g(home, 'clone', '-q', '--shared', '--no-checkout', REAL, throwaway);
		g(throwaway, 'update-ref', 'refs/remotes/origin/develop', realDevelop as string);
		g(throwaway, 'config', 'user.name', 'Noah');
		g(throwaway, 'config', 'user.email', 'noah@example.com');
		const real = new TokenBranches({
			system: () => ({ ...REAL_FUI, root: throwaway }),
			file: join(home, 'token-branches.json'),
			tools: () => NOTHING_SHARED,
		});
		const b = await real.save([
			{ path: 'tone.pineGreen.50', value: '#0A6B52' },
			{ path: 'palette.dark.primary.main', ref: 'tone.pineGreen.60' },
			{ path: 'spacing', value: '6px' },
		]);
		expect(g(throwaway, 'rev-parse', `${b.branch}^`).trim()).toBe(realDevelop);
		const changed = g(throwaway, 'diff', '--numstat', realDevelop as string, b.branch)
			.trim()
			.split('\n');
		// Three files, one line each, nothing else.
		expect(changed.map((l) => l.split('\t').slice(0, 2).join(' '))).toEqual(['1 1', '1 1', '1 1']);
		// From whatever the library has today, to the value saved.
		expect(g(throwaway, 'log', '-1', '--format=%B', b.branch)).toMatch(/Tones pineGreen 50: #[0-9A-F]{6} → #0A6B52/i);
		// The person's clone has no such branch: nothing was written there.
		expect(g(REAL, 'branch', '--list', b.branch).trim()).toBe('');
	}, 60_000);
});
