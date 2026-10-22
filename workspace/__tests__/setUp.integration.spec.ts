import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DesignRepositoryClones, NO_CLONES } from '../src/core/services/products/discovery';
import { designRepositoryForSetup, handSetUp, setUpTask, setupMoved, setupState } from '../src/core/services/products/setUp';
import { DESIGN_REPO } from '../src/shared/config';
import { g, writeFiles } from './fixtures';

let home: string;
let product: string;
let clones: DesignRepositoryClones;
const NO_ANSWERS = { of: () => undefined };

/** A design repository: a git repository with the agent guide, its origin `origin`, and the setup note. */
const designRepository = (dir: string, origin: string | null = null) => {
	writeFiles(dir, { 'agents/ui-guide.md': '# Guide\n', 'skills/set-up-a-product.md': '# Set up a product for DSNR\n\nThe note.\n' });
	g(dir, 'init', '-q');
	if (origin) g(dir, 'remote', 'add', 'origin', origin);
	return dir;
};
const commit = (dir: string) => {
	g(dir, 'add', '-A');
	g(dir, 'commit', '-q', '-m', 'set up');
};

beforeEach(() => {
	home = mkdtempSync(join(tmpdir(), 'dsnr-set-up-'));
	product = join(home, 'paradome');
	writeFiles(product, { 'package.json': JSON.stringify({ name: 'paradome-client' }) });
	g(product, 'init', '-q');
	g(product, 'config', 'user.name', 'Test');
	g(product, 'config', 'user.email', 'test@example.com');
	clones = new DesignRepositoryClones(join(home, 'design-repositories.json'));
});
afterEach(() => rmSync(home, { recursive: true, force: true }));

describe('where setting the open repository up stands', () => {
	const state = (folders: string[], open: string | null = null) => setupState(folders, open, { answers: NO_ANSWERS, clones: NO_CLONES });

	it('is not set up for a repository with no workspace file, and nothing for a folder that is no repository, or a design repository', async () => {
		mkdirSync(join(home, 'notes'));
		const design = designRepository(join(home, 'flock-designer'));
		expect(await state([join(home, 'notes'), design, product])).toEqual({ state: 'not-set-up', root: product });
		expect(await state([join(home, 'notes'), design])).toBeNull();
	});

	it('is up for review while its workspace file is not committed, with what DSNR reads of it, and nothing once it is', async () => {
		writeFiles(product, { '.dsnr/workspace.json': '{ "version": 2 }' });
		// Written by the agent and not yet found as the product: no longer waiting to be set up.
		expect(await state([product])).toBeNull();
		expect(await state([product], product)).toEqual({
			state: 'review',
			root: product,
			check: { problems: ['.dsnr/workspace.json declares version 2; this app understands 1'], missing: [], commands: [] },
		});
		commit(product);
		expect(await state([product], product)).toBeNull();
	});

	it('moves, for the watch to read it again, as files are written and when they are committed, and not otherwise', async () => {
		const before = await setupMoved(product);
		expect(await setupMoved(product)).toBe(before);
		writeFiles(product, { '.dsnr/manifest.md': '# Paradome\n' });
		const written = await setupMoved(product);
		expect(written).not.toBe(before);
		commit(product);
		expect(await setupMoved(product)).not.toBe(written);
	});
});

describe('the design repository a product is set up with', () => {
	const choose = vi.fn(async (): Promise<string | null> => null);

	it('is always the person’s pick, offered first at Flock’s clone, beside the product or where the person keeps it', async () => {
		// The pick decides where every prototype, comment and page of the product goes, so it is never made for them.
		const accept = vi.fn(async (startAt: string | null) => startAt);
		const beside = designRepository(join(home, DESIGN_REPO.repo));
		expect(await designRepositoryForSetup(product, { clones, choose: accept })).toEqual({
			design: beside,
			repository: `${DESIGN_REPO.owner}/${DESIGN_REPO.repo}`,
		});
		expect(accept).toHaveBeenLastCalledWith(beside);
		rmSync(beside, { recursive: true });
		const kept = designRepository(join(home, 'elsewhere', 'designs'));
		clones.set(`${DESIGN_REPO.owner}/${DESIGN_REPO.repo}`, kept);
		expect((await designRepositoryForSetup(product, { clones, choose: accept }))?.design).toBe(kept);
		expect(accept).toHaveBeenLastCalledWith(kept);
	});

	it('is another company’s when the person picks it over Flock’s clone beside the product', async () => {
		designRepository(join(home, DESIGN_REPO.repo));
		const theirs = designRepository(join(home, 'cheq-designer'), 'git@github.com:cheq/cheq-designer.git');
		expect(await designRepositoryForSetup(product, { clones, choose: async () => theirs })).toEqual({
			design: theirs,
			repository: 'cheq/cheq-designer',
		});
	});

	it('is the folder the person picks otherwise, named by its origin and kept for that repository, so the product finds it again', async () => {
		const picked = designRepository(join(home, 'Work', 'cheq-designer'), 'git@github.com:cheq/cheq-designer.git');
		const pick = vi.fn(async () => picked);
		expect(await designRepositoryForSetup(product, { clones, choose: pick })).toEqual({ design: picked, repository: 'cheq/cheq-designer' });
		expect(clones.at('cheq/cheq-designer')).toBe(picked);
	});

	it('refuses a picked folder whose origin does not say which repository it is, rather than taking it for Flock’s', async () => {
		const picked = designRepository(join(home, 'cheq-designer'), 'git@gitlab.com:cheq/cheq-designer.git');
		await expect(designRepositoryForSetup(product, { clones, choose: async () => picked })).rejects.toThrow(
			`${picked} has no GitHub origin, so which design repository it is cannot be told`,
		);
	});

	it('is none when the person picks none, and refuses a folder that is no design repository', async () => {
		expect(await designRepositoryForSetup(product, { clones, choose })).toBeNull();
		mkdirSync(join(home, 'plain'));
		await expect(designRepositoryForSetup(product, { clones, choose: async () => join(home, 'plain') })).rejects.toThrow(
			`${join(home, 'plain')} is not a design repository`,
		);
	});
});

describe('the setup handed to the agent', () => {
	it('says where things are and the exact commands, then the note, and names a design repository that is not Flock’s', () => {
		const task = setUpTask({ root: '/w/paradome', design: '/w/cheq-designer', repository: 'cheq/cheq-designer', note: '# The note' });
		expect(task).toContain(
			'- **Its design repository:** /w/cheq-designer (`cheq/cheq-designer`, not Flock\'s: write `"designRepository": "cheq/cheq-designer"`)',
		);
		expect(task).toContain('- **Write the agent files with:** `node "/w/cheq-designer/workspace/bin/dsnr.mjs" agent-files --product "/w/paradome"`');
		expect(task).toContain('- **Check with:** `node "/w/cheq-designer/workspace/bin/dsnr.mjs" check-setup --product "/w/paradome"`');
		expect(task.endsWith('\n# The note')).toBe(true);
		expect(setUpTask({ root: '/w/coke', design: '/w/flock-designer', repository: `${DESIGN_REPO.owner}/${DESIGN_REPO.repo}`, note: '' })).toContain(
			"Flock's: leave `designRepository` out",
		);
	});

	it('writes the task from the design repository’s own note, beside the prototypes, and hands it over', async () => {
		const design = designRepository(join(home, DESIGN_REPO.repo));
		// Installed as npm leaves it: a package the dsnr command can resolve.
		writeFiles(join(design, 'workspace', 'node_modules', 'esbuild'), { 'package.json': '{ "name": "esbuild", "main": "index.js" }', 'index.js': '' });
		const hand = vi.fn(async (prepare: () => Promise<{ task: string; taskFile: string; root: string; what: string }>) => {
			const prepared = await prepare();
			expect(prepared).toMatchObject({
				root: product,
				what: 'Set up paradome for DSNR.',
				taskFile: join(home, 'prototypes', '_set-up', 'paradome.md'),
			});
			expect(prepared.task).toContain('The note.');
			return { agent: 'Claude Code', opened: 'typed' as const, command: null };
		});
		expect(await handSetUp({ root: product, clones, prototypesRoot: join(home, 'prototypes'), choose: async (at) => at, hand })).toMatchObject({
			agent: 'Claude Code',
		});
		expect(hand).toHaveBeenCalledOnce();
	});

	it('refuses a product set up already, and hands nothing over when the dsnr command cannot be built', async () => {
		designRepository(join(home, DESIGN_REPO.repo));
		const hand = vi.fn();
		const set = { root: product, clones, prototypesRoot: join(home, 'prototypes'), choose: async (at: string | null) => at, hand };
		await expect(handSetUp(set)).rejects.toThrow(/run npm ci there first\.$/);
		writeFiles(product, { '.dsnr/workspace.json': '{}' });
		await expect(handSetUp(set)).rejects.toThrow('paradome is set up already: it has .dsnr/workspace.json.');
		expect(hand).not.toHaveBeenCalled();
	});
});
