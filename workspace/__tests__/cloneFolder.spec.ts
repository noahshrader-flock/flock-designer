import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path, { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CloneFolderMemory, type ClonePlaceDeps, clonePlace, cloneFolderOf, defaultCloneFolder } from '../src/main/services/cloneFolder';

/**
 * Where clones go (C1 of the clone plan): the folder this person chose, or a default beside their work, and where a
 * repository would be placed in it, never over anything.
 */

describe('the default clone folder', () => {
	const exists = (...dirs: string[]) => (p: string) => dirs.includes(p);

	it('is beside the repository last worked in, so the design repository stays next to it', () => {
		expect(defaultCloneFolder({ home: '/h', exists: exists('/h/GitHub'), clones: ['/h/code/flock-coke', '/h/GitHub/other'] })).toBe('/h/code');
	});

	it('is otherwise the first usual code folder that exists, in discovery’s order', () => {
		expect(defaultCloneFolder({ home: '/h', exists: exists('/h/GitHub', '/h/Documents/GitHub'), clones: [] })).toBe('/h/Documents/GitHub');
		expect(defaultCloneFolder({ home: '/h', exists: exists('/h/dev', '/h/GitHub'), clones: [] })).toBe('/h/GitHub');
	});

	it('is never Documents or the home folder itself, and is ~/Documents/GitHub when no code folder exists', () => {
		expect(defaultCloneFolder({ home: '/h', exists: exists('/h', '/h/Documents'), clones: [] })).toBe('/h/Documents/GitHub');
	});

	it('gives way to the one the person chose', () => {
		const deps = { home: '/h', exists: exists('/h/GitHub'), clones: [] };
		expect(cloneFolderOf({ read: () => '/Volumes/work/repos' }, deps)).toBe('/Volumes/work/repos');
		expect(cloneFolderOf({ read: () => null }, deps)).toBe('/h/GitHub');
	});
});

describe('remembering the clone folder', () => {
	let dir: string;
	afterEach(() => rmSync(dir, { recursive: true, force: true }));

	it('keeps the folder chosen, and reads nothing from a missing, broken or relative entry', () => {
		dir = mkdtempSync(join(tmpdir(), 'fdw-clone-folder-'));
		const file = join(dir, 'clone-folder.json');
		const memory = new CloneFolderMemory(file);
		expect(memory.read()).toBeNull();
		memory.write('/Users/pat/code');
		expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ folder: '/Users/pat/code' });
		expect(memory.read()).toBe('/Users/pat/code');
		for (const junk of ['{', '{"folder": 3}', '{"folder": "code"}']) {
			writeFileSync(file, junk);
			expect(memory.read()).toBeNull();
		}
	});
});

describe('where a repository would be placed', () => {
	const tree = (entries: Record<string, string[]>, origins: Record<string, string> = {}): ClonePlaceDeps => ({
		exists: (p) => p in entries || Object.values(entries).some((files) => files.some((f) => p === f)),
		list: (d) => entries[d] ?? [],
		origin: (root) => origins[root] ?? null,
	});

	it('is the repository’s name inside the folder, and free when nothing is there or the folder is empty', () => {
		expect(clonePlace('/h/GitHub', 'flocksafety/flock-coke', tree({}))).toEqual({ state: 'free', path: '/h/GitHub/flock-coke' });
		expect(clonePlace('/h/GitHub', 'flocksafety/flock-coke', tree({ '/h/GitHub/flock-coke': [] }))).toMatchObject({ state: 'free' });
	});

	it('is already cloned when a clone of the same repository is there, matched by its origin as GitHub matches names', () => {
		const deps = tree({ '/h/GitHub/flock-coke': ['.git', 'src'], '/h/GitHub/flock-coke/.git': [] }, { '/h/GitHub/flock-coke': 'git@github.com:FlockSafety/flock-coke.git' });
		expect(clonePlace('/h/GitHub', 'flocksafety/flock-coke', deps)).toEqual({ state: 'cloned', path: '/h/GitHub/flock-coke' });
	});

	it('is taken by another repository’s clone, or by anything else, and says which', () => {
		const other = tree({ '/h/GitHub/flock-coke': ['.git'], '/h/GitHub/flock-coke/.git': [] }, { '/h/GitHub/flock-coke': 'https://github.com/someone/flock-coke.git' });
		expect(clonePlace('/h/GitHub', 'flocksafety/flock-coke', other)).toMatchObject({ state: 'taken', why: expect.stringContaining('someone/flock-coke') });
		const files = tree({ '/h/GitHub/flock-coke': ['notes.txt'] });
		expect(clonePlace('/h/GitHub', 'flocksafety/flock-coke', files)).toMatchObject({ state: 'taken', why: expect.stringContaining('not a clone of flocksafety/flock-coke') });
	});

	it('refuses anything that is not a GitHub repository name, so no path is made of one', () => {
		for (const bad of ['flock-coke', 'a/b/c', 'a/..', 'a/.', '../x', 'a/b c', 'a/b;rm', '']) {
			expect(() => clonePlace('/h/GitHub', bad, tree({}))).toThrow(/not a GitHub repository name/);
		}
	});

	it('joins a Windows path the Windows way', () => {
		expect(clonePlace('C:\\Users\\pat\\GitHub', 'flocksafety/flock-coke', { ...tree({}), paths: path.win32 })).toEqual({ state: 'free', path: 'C:\\Users\\pat\\GitHub\\flock-coke' });
	});
});
