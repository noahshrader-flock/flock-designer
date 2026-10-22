import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { designStore } from '../src/core/services/publishing/designStore';

let clone: string;
beforeEach(() => {
	clone = mkdtempSync(join(tmpdir(), 'fd-store-'));
	mkdirSync(join(clone, 'prototypes', 'p'), { recursive: true });
	writeFileSync(join(clone, 'prototypes', 'p', 'brief.md'), '# Here');
});
afterEach(() => rmSync(clone, { recursive: true, force: true }));

const github = () => ({
	readFile: vi.fn(async (path: string) => (path.endsWith('notes.md') ? '# From GitHub' : null)),
	readBytes: vi.fn(async () => null),
	hasFile: vi.fn(async () => false),
	writeFile: vi.fn(async () => undefined),
	removeFolder: vi.fn(async () => undefined),
});

describe('the design repository, read and written', () => {
	it('reads the clone here, and from GitHub only what the clone does not have yet', async () => {
		const repo = github();
		const store = designStore({ clone: () => clone, files: () => repo, onWrite: () => undefined });
		expect(await store.readFile('prototypes/p/brief.md')).toBe('# Here');
		expect(repo.readFile).not.toHaveBeenCalled();
		expect(await store.readFile('prototypes/p/notes.md')).toBe('# From GitHub');
	});

	it('is GitHub when there is no clone, asked once for a file', async () => {
		const repo = github();
		const store = designStore({ clone: () => null, files: () => repo, onWrite: () => undefined });
		expect(await store.readFile('prototypes/p/missing.md')).toBeNull();
		expect(repo.readFile).toHaveBeenCalledOnce();
	});

	it('removes a folder on GitHub when there is no clone, in one change', async () => {
		const repo = github();
		await designStore({ clone: () => null, files: () => repo, onWrite: () => undefined })
			.records()
			.remove('prototypes/p', 'p: deleted');
		expect(repo.removeFolder).toHaveBeenCalledExactlyOnceWith('prototypes/p', 'p: deleted');
	});

	it('is the clone alone where there is no GitHub to ask, as for the command line', async () => {
		const store = designStore({ clone: () => clone, files: () => null, onWrite: () => undefined });
		expect(await store.readFile('prototypes/p/notes.md')).toBeNull();
		expect(await store.readFile('prototypes/p/brief.md')).toBe('# Here');
	});
});
