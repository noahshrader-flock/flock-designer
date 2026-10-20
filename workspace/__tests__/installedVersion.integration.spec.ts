import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installedAgainstBase, pinnedAt } from '../src/core/services/prototypes/installedVersion';
import { g } from './fixtures';

let root: string;

const commit = (files: Record<string, string>) => {
	for (const [name, text] of Object.entries(files)) writeFileSync(join(root, name), text);
	g(root, 'add', '-A');
	g(root, 'commit', '-q', '--allow-empty', '-m', 'lock');
	return g(root, 'rev-parse', 'HEAD');
};

/** npm's lockfile as versions 2 and 3 write it: by installed path. */
const lockV3 = (version: string) => JSON.stringify({ lockfileVersion: 3, packages: { '': {}, 'node_modules/@acme/ui': { version } } });

const against = (at: string, installed: string | null, install: string | null = 'npm ci') =>
	installedAgainstBase({ root, commit: at, branch: 'develop', pkg: '@acme/ui', installed, install });

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), 'fdw-lock-'));
	g(root, 'init', '-q', '-b', 'develop');
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('the design system as installed, against what the base pins', () => {
	it('says nothing when they are the same', async () => {
		expect(await against(commit({ 'package-lock.json': lockV3('5.7.3') }), '5.7.3')).toBeNull();
	});

	it('says what the branch pins and what is installed, and how to match, when they differ either way', async () => {
		const at = commit({ 'package-lock.json': lockV3('5.7.3') });
		expect(await against(at, '5.5.4')).toBe(
			"develop pins @acme/ui 5.7.3, and 5.5.4 is installed here, so the prototype may not match develop: it is built against 5.5.4. To match, install develop's packages (`npm ci`).",
		);
		expect(await against(at, '6.0.0')).toMatch(/^develop pins @acme\/ui 5\.7\.3, and 6\.0\.0 is installed here/);
		// A product that declares no install command is told what to do without one.
		expect(await against(at, '5.5.4', null)).toMatch(/To match, install develop's packages\.$/);
	});

	it('reads the commit’s lockfile, never the working tree’s', async () => {
		const at = commit({ 'package-lock.json': lockV3('5.7.3') });
		writeFileSync(join(root, 'package-lock.json'), lockV3('5.5.4'));
		expect(await pinnedAt(root, at, '@acme/ui')).toEqual({ version: '5.7.3' });
	});

	it('reads npm’s first lockfile version too, and its shrinkwrap', async () => {
		const v1 = JSON.stringify({ lockfileVersion: 1, dependencies: { '@acme/ui': { version: '4.2.0' } } });
		expect(await pinnedAt(root, commit({ 'package-lock.json': v1 }), '@acme/ui')).toEqual({ version: '4.2.0' });
		g(root, 'rm', '-q', 'package-lock.json');
		expect(await pinnedAt(root, commit({ 'npm-shrinkwrap.json': lockV3('4.3.0') }), '@acme/ui')).toEqual({ version: '4.3.0' });
	});

	it('says it cannot tell, and why, rather than guessing', async () => {
		expect(await against(commit({ 'README.md': 'no lock' }), '5.5.4')).toBe(
			'Whether @acme/ui 5.5.4, as installed here, is the one develop uses is not known: it has no lockfile.',
		);
		expect(await pinnedAt(root, commit({ 'package-lock.json': lockV3('1.0.0').replace('@acme/ui', '@other/ui') }), '@acme/ui')).toEqual({
			unknown: 'its package-lock.json has no entry for @acme/ui',
		});
		expect(await pinnedAt(root, commit({ 'package-lock.json': '{ not json' }), '@acme/ui')).toEqual({
			unknown: 'its package-lock.json cannot be read',
		});
		g(root, 'rm', '-q', 'package-lock.json');
		expect(await pinnedAt(root, commit({ 'yarn.lock': '# yarn lockfile v1\n' }), '@acme/ui')).toEqual({
			unknown: 'its lockfile is yarn.lock, which DSNR does not read',
		});
	});

	it('says nothing when nothing is installed, which readiness says', async () => {
		expect(await against(commit({ 'package-lock.json': lockV3('5.7.3') }), null)).toBeNull();
	});
});
