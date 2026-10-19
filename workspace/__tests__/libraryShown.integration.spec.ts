import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readLibrary } from '../src/core/services/designSystem/designLibrary';
import { LibraryShown } from '../src/core/services/designSystem/libraryShown';
import type { Catalog, ConnectedDesignSystem } from '../src/shared/contract';

/**
 * Preview this branch: the commit the tab reads is one choice, the library's own branch or a
 * branch handed to Claude Code, read from git's objects at its tip. Against a real clone.
 */

let home: string;
let clone: string;
let system: ConnectedDesignSystem;
let told: (string | null)[];
const BRANCH = 'dsnr/handoff-20261017-ab12';
const g = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const story = (title: string) => `const meta = {\n  title: '${title}',\n};\nexport default meta;\n`;
const write = (root: string, files: Record<string, string>) => {
	for (const [path, text] of Object.entries(files)) {
		mkdirSync(dirname(join(root, path)), { recursive: true });
		writeFileSync(join(root, path), text);
	}
};
const ready = (c: Catalog) => {
	if (c.state !== 'ready') throw new Error(`not ready: ${c.state}`);
	return c;
};
/** What Claude Code does: its branch from the base, committed, and the checkout back on develop. */
const claudeCommits = (files: Record<string, string>) => {
	g(clone, 'switch', '-q', '-c', BRANCH, 'origin/develop');
	write(clone, files);
	g(clone, 'add', '-A');
	g(clone, 'commit', '-q', '-m', 'Claude Code: a new component');
	g(clone, 'switch', '-q', 'develop');
};

beforeEach(() => {
	home = mkdtempSync(join(tmpdir(), 'dsnr-shown-'));
	const upstream = join(home, 'upstream');
	clone = join(home, 'ui');
	g(home, 'init', '-q', '--bare', '-b', 'develop', join(home, 'remote.git'));
	mkdirSync(upstream);
	g(upstream, 'init', '-q', '-b', 'develop');
	g(upstream, 'config', 'user.name', 'Noah');
	g(upstream, 'config', 'user.email', 'noah@example.com');
	write(upstream, { 'src/components/FSButton/FSButton.stories.tsx': story('Buttons/FSButton') });
	g(upstream, 'add', '-A');
	g(upstream, 'commit', '-q', '-m', 'library');
	g(upstream, 'remote', 'add', 'origin', join(home, 'remote.git'));
	g(upstream, 'push', '-q', 'origin', 'develop');
	g(home, 'clone', '-q', join(home, 'remote.git'), clone);
	g(clone, 'config', 'user.name', 'Noah');
	g(clone, 'config', 'user.email', 'noah@example.com');
	system = { id: 'o/ui', name: 'UI', repository: 'o/ui', root: clone, folder: '', branch: 'develop' };
	told = [];
});
afterEach(() => rmSync(home, { recursive: true, force: true }));

describe('the commit the tab reads', () => {
	it('is the library’s own branch until a hand-over’s is shown, then that branch’s tip, and the library’s again when stopped', async () => {
		claudeCommits({ 'src/components/FSChip/FSChip.stories.tsx': story('Inputs/FSChip') });
		const shown = new LibraryShown((showing) => told.push(showing));
		const base = ready(await readLibrary(system, 'unchanged', shown.at));
		expect([base.commit, base.showing, base.components.map((c) => c.name)]).toEqual([g(clone, 'rev-parse', 'origin/develop'), null, ['FSButton']]);

		shown.show(system, 'src/components/FSChip/FSChip.stories.tsx', BRANCH);
		const branch = ready(await readLibrary(system, 'unchanged', shown.at));
		expect([branch.commit, branch.showing, branch.branch]).toEqual([g(clone, 'rev-parse', BRANCH), BRANCH, 'develop']);
		expect(branch.components.map((c) => c.name).sort()).toEqual(['FSButton', 'FSChip']);
		expect(shown.scope(system)).toBe('src/components/FSChip/FSChip.stories.tsx');

		shown.stop(system);
		expect(ready(await readLibrary(system, 'unchanged', shown.at)).showing).toBeNull();
		expect(told).toEqual([BRANCH, null]);
	});

	it('reads only what is committed on the branch, whatever the folder has', async () => {
		claudeCommits({ 'src/components/FSChip/FSChip.stories.tsx': story('Inputs/FSChip') });
		g(clone, 'switch', '-q', BRANCH);
		write(clone, { 'src/components/FSTag/FSTag.stories.tsx': story('Inputs/FSTag') });
		const shown = new LibraryShown(() => undefined);
		shown.show(system, '', BRANCH);
		expect(ready(await readLibrary(system, 'unchanged', shown.at)).components.map((c) => c.name)).not.toContain('FSTag');
	});

	it('goes back to the library’s own branch, and says so, when the branch shown is deleted', async () => {
		claudeCommits({ 'src/components/FSChip/FSChip.stories.tsx': story('Inputs/FSChip') });
		const shown = new LibraryShown((showing) => told.push(showing));
		shown.show(system, '', BRANCH);
		g(clone, 'branch', '-q', '-D', BRANCH);
		expect(ready(await readLibrary(system, 'unchanged', shown.at)).showing).toBeNull();
		expect(told).toEqual([BRANCH, null]);
		expect(shown.scope(system)).toBeNull();
	});

	it('shows only a branch DSNR named for a hand-over', () => {
		const shown = new LibraryShown(() => undefined);
		expect(() => shown.show(system, '', 'main')).toThrow('not a branch DSNR named');
		expect(() => shown.show(system, '', 'dsnr/values-20261017-ab12')).toThrow('not a branch DSNR named');
	});

	it('refuses saving and handing over while a branch is shown, and says how to go on', () => {
		const shown = new LibraryShown(() => undefined);
		expect(() => shown.refuse(system, 'save')).not.toThrow();
		shown.show(system, '', BRANCH);
		expect(() => shown.refuse(system, 'save')).toThrow(`The previews show ${BRANCH}, not develop: show develop again to save.`);
		// Another design system shown is not this one's choice.
		expect(() => shown.refuse({ ...system, id: 'o/other' }, 'save')).not.toThrow();
	});
});
