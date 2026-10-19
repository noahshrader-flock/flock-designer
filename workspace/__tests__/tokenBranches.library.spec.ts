import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import type { ShareTools } from '../src/core/ports';
import { readTokens } from '../src/core/services/designSystem/designTokens';
import { TokenBranches } from '../src/core/services/designSystem/tokenBranches';
import type { ConnectedDesignSystem } from '../src/shared/contract';
import { g, gitFile } from './fixtures';
import { editedFiles } from '../src/core/services/designSystem/tokenEdits';
import { aColorAndALength } from './tokenFixtures';
import { EVERY_LIBRARY, describeWith, libraryRow, readsOf } from './realCheckouts';

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
	isOpen: refused,
	checks: refused,
	sleep: async () => undefined,
	now: () => 0,
};

/** Saved to a throwaway clone at the library's tip: the person's clone is never written to. */
const throwawayOf = (system: ConnectedDesignSystem) => {
	const ref = `refs/remotes/origin/${system.branch}`;
	const tip = g(system.root, 'rev-parse', ref);
	const clone = join(home, 'library');
	g(home, 'clone', '-q', '--shared', '--no-checkout', system.root, clone);
	g(clone, 'update-ref', ref, tip);
	// Its installed packages, as the person's clone has them: a token a package declares is read from there.
	for (const at of [...new Set(['', system.folder])])
		if (existsSync(join(system.root, at, 'node_modules'))) {
			mkdirSync(join(clone, at), { recursive: true });
			symlinkSync(join(system.root, at, 'node_modules'), join(clone, at, 'node_modules'));
		}
	g(clone, 'config', 'user.name', 'Test Person');
	g(clone, 'config', 'user.email', 'test@example.test');
	const branches = new TokenBranches({
		system: () => ({ ...system, root: clone }),
		file: join(home, 'token-branches.json'),
		tools: () => NOTHING_SHARED,
	});
	return { clone, tip, branches };
};

for (const { key, system, missing, tokens } of EVERY_LIBRARY)
	describeWith(missing, `saving a change to ${key}’s tokens`, () => {
		it.skipIf(!tokens)(
			'commits a color and a length on its branch, one commit holding exactly what the change writes, and nothing of the person’s',
			async () => {
				const reads = await readsOf(system);
				const edits = aColorAndALength((await readTokens(reads)).tokens);
				expect(edits).toHaveLength(2);
				// What the change writes, in the library's own files: a token a package declares is declared again there.
				const written = await editedFiles(reads, edits);
				const { clone, tip, branches } = throwawayOf(system);
				const b = await branches.save(edits);
				expect(g(clone, 'rev-parse', `${b.branch}^`)).toBe(tip);
				expect(g(clone, 'diff', '--name-only', tip, b.branch).split('\n').sort()).toEqual([...written.keys()].sort());
				for (const [file, text] of written) expect(gitFile(clone, b.branch, file), file).toBe(text);
				expect(g(system.root, 'branch', '--list', b.branch)).toBe('');
			},
			60_000,
		);
	});

const fui = libraryRow('FUI');
describeWith(fui.missing, 'saving a change to FUI’s tokens', () => {
	it('commits a tone, a role pointed at another step and the spacing, each in its own file, and says the tone in the message', async () => {
		const { clone, tip, branches } = throwawayOf(fui.system);
		const b = await branches.save([
			{ path: 'tone.pineGreen.50', value: '#0A6B52' },
			{ path: 'palette.dark.primary.main', ref: 'tone.pineGreen.60' },
			{ path: 'spacing', value: '6px' },
		]);
		const changed = g(clone, 'diff', '--numstat', tip, b.branch).split('\n');
		expect(changed.map((l) => l.split('\t').slice(0, 2).join(' '))).toEqual(['1 1', '1 1', '1 1']);
		expect(g(clone, 'log', '-1', '--format=%B', b.branch)).toMatch(/Tones pineGreen 50: #[0-9A-F]{6} → #0A6B52/i);
	}, 60_000);
});
