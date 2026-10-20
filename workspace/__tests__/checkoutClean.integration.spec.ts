import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { unfinishedWork } from '../src/core/services/codebase/checkoutClean';
import { readDescriptor } from '../src/core/services/projects/descriptor';
import { continueWork, createCodebaseWork } from '../src/core/services/projects/workRecords';
import { g, makeProductFiles } from './fixtures';

/** Claude Code starts only on a checkout with no unfinished work, so its edits never mix with the person's. */

let root: string;
const write = (file: string, text: string) => writeFileSync(join(root, file), text);

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), 'dsnr-checkout-clean-'));
	g(root, 'init', '-q', '-b', 'develop');
	g(root, 'config', 'user.name', 'Noah');
	g(root, 'config', 'user.email', 'noah@example.com');
	write('theme.ts', 'export const radius = 8;\n');
	g(root, 'add', '-A');
	g(root, 'commit', '-q', '-m', 'library');
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('a design system checkout handed to Claude Code', () => {
	it('is ready with nothing unfinished, on a branch', async () => {
		expect(await unfinishedWork(root, 'the design system’s checkout')).toBeNull();
	});

	it('is not with a change to a file, or a new one, which Claude Code’s commit would sweep in', async () => {
		write('theme.ts', 'export const radius = 12;\n');
		expect(await unfinishedWork(root, 'the design system’s checkout')).toContain(
			'1 file is changed or new and not committed. Commit or stash them first',
		);
		write('notes.md', 'mine\n');
		expect(await unfinishedWork(root, 'the design system’s checkout')).toContain('2 files are changed or new');
	});

	it('counts a new file even when the clone is set to hide them from its status', async () => {
		g(root, 'config', 'status.showUntrackedFiles', 'no');
		write('notes.md', 'mine\n');
		expect(await unfinishedWork(root, 'the design system’s checkout')).toContain('1 file is changed or new');
	});

	it('is not in the middle of a merge', async () => {
		g(root, 'switch', '-q', '-c', 'other');
		write('theme.ts', 'export const radius = 10;\n');
		g(root, 'commit', '-qam', 'other');
		g(root, 'switch', '-q', 'develop');
		write('theme.ts', 'export const radius = 6;\n');
		g(root, 'commit', '-qam', 'develop');
		try {
			g(root, 'merge', 'other');
		} catch {
			// The conflict leaves the merge unfinished, as a person would have it.
		}
		// What it is in the middle of is said, not the conflicted file it leaves.
		expect(await unfinishedWork(root, 'the design system’s checkout')).toBe(
			'The design system’s checkout is in the middle of a merge. Finish it or abort it first.',
		);
	});

	it('is not on a detached HEAD', async () => {
		g(root, 'checkout', '-q', '--detach');
		expect(await unfinishedWork(root, 'the design system’s checkout')).toBe(
			'The design system’s checkout is not on a branch (a detached HEAD). Switch to a branch first.',
		);
	});
});

describe('a product that holds its own design system: component changes and codebase work share its one checkout', () => {
	const SHARED = 'holds its own design system, so its component changes and its codebase work share this one checkout.';
	let records: string;
	/** The product names paradome-client as its design system; its own package is it, as Paradome's is, unless named otherwise. */
	const holdsItsOwn = (rootPackage = 'paradome-client') => {
		makeProductFiles(root);
		const file = join(root, '.dsnr', 'workspace.json');
		writeFileSync(file, JSON.stringify({ ...(JSON.parse(readFileSync(file, 'utf8')) as object), designSystem: { package: 'paradome-client' } }));
		write('package.json', JSON.stringify({ name: rootPackage }));
		g(root, 'add', '-A');
		g(root, 'commit', '-q', '-m', 'product');
	};
	const startCodebase = () => createCodebaseWork(root, records, readDescriptor(root), 'zones', 'x', 'develop');
	beforeEach(() => {
		records = join(mkdtempSync(join(tmpdir(), 'dsnr-shared-records-')), 'projects');
		mkdirSync(records);
	});
	afterEach(() => rmSync(dirname(records), { recursive: true, force: true }));

	it('refuses a component change over codebase work left uncommitted, saying they share the checkout', async () => {
		holdsItsOwn();
		await startCodebase();
		write('zones.ts', 'export const zones = [];\n');
		expect(await unfinishedWork(root, 'the design system’s checkout')).toMatch(new RegExp(`not committed\\..* ${basename(root)} ${SHARED}`));
	});

	it('refuses codebase work, started or continued, over a component change left uncommitted, saying the same', async () => {
		holdsItsOwn();
		await startCodebase();
		g(root, 'switch', '-q', '-c', 'dsnr/handoff-1', 'develop');
		write('theme.ts', 'export const radius = 4;\n');
		await expect(continueWork(root, records, 'zones', 'codebase', null, readDescriptor(root))).rejects.toThrow(
			`There are uncommitted changes in ${basename(root)}. Commit or put them aside before switching branches. ${basename(root)} ${SHARED}`,
		);
		rmSync(join(records, 'zones'), { recursive: true, force: true });
		await expect(startCodebase()).rejects.toThrow(SHARED);
	});

	it('says nothing of sharing for a product whose design system is a repository of its own', async () => {
		holdsItsOwn('a-product');
		write('theme.ts', 'export const radius = 4;\n');
		expect(await unfinishedWork(root, 'the design system’s checkout')).not.toContain('holds its own');
		await expect(startCodebase()).rejects.toThrow(/before starting a new branch\.$/);
	});
});
