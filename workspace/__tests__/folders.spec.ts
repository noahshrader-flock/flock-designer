import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Project } from '../src/shared/contract';
import { DesignRepo } from '../src/main/services/designRepo';
import type { GitHubSession } from '../src/main/services/githubSession';
import { readFolderProjects } from '../src/main/services/localProjects';
import { assignFolder, recordPrototype, type RecordStore } from '../src/main/services/prototype';
import {
	briefBody,
	briefFolder,
	firstHeading,
	folderName,
	foldersOf,
	inFolder,
	mergeProjects,
	projectDir,
	projectPath,
	sameFolder,
	shownRecord,
	withFolder,
} from '../src/shared/projects';
import { memoryStore } from './fixtures';

/**
 * A project's folder (F1 of the folders plan): a label, kept in its brief's front matter in the design repository, read
 * with the brief wherever the brief is read, and left out of what a person is shown of the brief.
 */

const BRIEF = '# Alert history\n\nWhat an admin sees of past alerts.\n';
const FILED = `---\nfolder: Admin\n---\n${BRIEF}`;

describe('a folder name', () => {
	it('is trimmed, with runs of spaces made one, and at most 60 characters', () => {
		expect(folderName('  Admin   area ')).toBe('Admin area');
		expect(folderName('Admin\tarea')).toBe('Admin area');
		expect(folderName('x'.repeat(80))).toBe('x'.repeat(60));
	});

	it('is nothing when there is nothing to it, or it is not text', () => {
		expect(folderName('   ')).toBeNull();
		expect(folderName(undefined)).toBeNull();
		expect(folderName(3)).toBeNull();
	});
});

describe('a brief’s folder', () => {
	it('is read from its front matter, and none without one', () => {
		expect(briefFolder(FILED)).toBe('Admin');
		expect(briefFolder(BRIEF)).toBeNull();
		expect(briefFolder('---\nother: x\n---\n# T\n')).toBeNull();
	});

	it('is read however the file’s lines end, and by the name rule', () => {
		expect(briefFolder('---\r\nfolder:   Admin   area\r\n---\r\n# T\r\n')).toBe('Admin area');
	});

	it('is not taken from a line that only looks like one, past the top of the brief', () => {
		expect(briefFolder(`${BRIEF}\n---\nfolder: Admin\n---\n`)).toBeNull();
	});

	it('leaves the title as it was', () => {
		expect(firstHeading(FILED)).toBe('Alert history');
	});
});

describe('a brief, as a person is shown it', () => {
	it('is the brief without its front matter', () => {
		expect(briefBody(FILED)).toBe(BRIEF);
		expect(briefBody(BRIEF)).toBe(BRIEF);
	});

	it('is shown so in a project’s record sheet, and every other record as it is', () => {
		expect(shownRecord('brief.md', FILED)).toBe(BRIEF);
		expect(shownRecord('review.md', FILED)).toBe(FILED);
	});
});

describe('putting a brief in a folder', () => {
	it('adds the front matter above a brief with none, and the rest is as it was', () => {
		expect(withFolder(BRIEF, 'Admin')).toBe(FILED);
	});

	it('changes only the folder of a brief that has one', () => {
		expect(withFolder(FILED, 'Roles')).toBe(`---\nfolder: Roles\n---\n${BRIEF}`);
	});

	it('keeps anything else the front matter holds', () => {
		const more = `---\nowner: noah\nfolder: Admin\n---\n${BRIEF}`;
		expect(withFolder(more, 'Roles')).toBe(`---\nowner: noah\nfolder: Roles\n---\n${BRIEF}`);
		expect(withFolder(more, null)).toBe(`---\nowner: noah\n---\n${BRIEF}`);
	});

	it('takes it out of its folder, leaving the brief exactly as it was before it had one', () => {
		expect(withFolder(FILED, null)).toBe(BRIEF);
		expect(withFolder(BRIEF, null)).toBe(BRIEF);
	});

	it('writes the name by the name rule, and a name that is nothing is no folder', () => {
		expect(withFolder(BRIEF, '  Admin   area ')).toBe(`---\nfolder: Admin area\n---\n${BRIEF}`);
		expect(withFolder(FILED, '   ')).toBe(BRIEF);
	});
});

describe('a project’s path', () => {
	it('is built in one place, for the project and for a file in it', () => {
		expect(projectDir('alpha')).toBe('projects/alpha');
		expect(projectPath('alpha', 'brief.md')).toBe('projects/alpha/brief.md');
	});
});

describe('reading a project’s folder', () => {
	let root: string;
	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'folders-'));
	});
	afterEach(() => rmSync(root, { recursive: true, force: true }));

	it('is read from this machine’s copy of the brief, with its title', () => {
		mkdirSync(join(root, 'alert-history'));
		writeFileSync(join(root, 'alert-history', 'brief.md'), FILED);
		mkdirSync(join(root, 'loose'));
		writeFileSync(join(root, 'loose', 'brief.md'), '# Loose\n');
		const byId = new Map(readFolderProjects(root).map((p) => [p.id, p]));
		expect(byId.get('alert-history')).toMatchObject({ title: 'Alert history', folder: 'Admin' });
		expect(byId.get('loose')).toMatchObject({ title: 'Loose', folder: null });
	});

	it('is read from GitHub’s copy of the brief, in the same request as its title', async () => {
		const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');
		const routes: Record<string, unknown> = {
			'/repos/acme/design/contents/projects/alpha/brief.md': { content: b64(FILED) },
			'/repos/acme/design/contents/projects/alpha': [{ type: 'file', name: 'brief.md' }],
			'/repos/acme/design/contents/projects/beta': [],
			'/repos/acme/design/contents/projects': [
				{ type: 'dir', name: 'alpha' },
				{ type: 'dir', name: 'beta' },
			],
			'/repos/acme/design/commits': [],
			'/repos/acme/design/issues': [],
		};
		const api = vi.fn(async (path: string) => {
			const key = Object.keys(routes)
				.filter((r) => path.startsWith(r))
				.sort((a, b) => b.length - a.length)[0];
			if (!key) throw new Error(`no stub for ${path}`);
			return routes[key];
		});
		const list = await new DesignRepo({ api } as unknown as GitHubSession, { owner: 'acme', repo: 'design' }).listProjects();
		const byId = new Map(list.map((p) => [p.id, p]));
		expect(byId.get('alpha')).toMatchObject({ title: 'Alert history', folder: 'Admin' });
		expect(byId.get('beta')).toMatchObject({ title: 'beta', folder: null });
		expect(api.mock.calls.filter(([p]) => String(p).endsWith('/brief.md'))).toHaveLength(1);
	});
});

describe('a project’s folder, when this machine and GitHub both know the project', () => {
	const project = (over: Partial<Project>): Project => ({
		id: 'alpha',
		title: 'Alpha',
		folder: null,
		records: ['brief.md'],
		iterations: [],
		people: [],
		...over,
	});

	it('is this machine’s, which is the one last written here and is synced from GitHub before every write', () => {
		const [merged] = mergeProjects([project({ folder: 'Admin' })], [project({ folder: 'Roles' })]);
		expect(merged?.folder).toBe('Roles');
		const [cleared] = mergeProjects([project({ folder: 'Admin' })], [project({ folder: null })]);
		expect(cleared?.folder).toBeNull();
	});

	it('is GitHub’s when this machine has no brief for it', () => {
		const [merged] = mergeProjects([project({ folder: 'Admin' })], [project({ records: [], folder: null })]);
		expect(merged?.folder).toBe('Admin');
	});
});

describe('assigning a project a folder', () => {
	/** A store that keeps what each write said, as the records' commit messages. */
	const said = (files: Record<string, string>) => {
		const { store, writes } = memoryStore(files);
		const messages: string[] = [];
		const telling: RecordStore = { ...store, write: async (p, c, m) => (messages.push(m), store.write(p, c, m)) };
		return { store: telling, files, writes, messages };
	};

	it('writes the folder into the brief, saying so, and nothing else', async () => {
		const { store, files, writes, messages } = said({ 'projects/alert-history/brief.md': BRIEF });
		await assignFolder(store, 'alert-history', 'Admin');
		expect(files['projects/alert-history/brief.md']).toBe(FILED);
		expect(writes).toEqual(['projects/alert-history/brief.md']);
		expect(messages).toEqual(['alert-history: put in the folder Admin']);
	});

	it('takes it out of its folder', async () => {
		const { store, files, messages } = said({ 'projects/alert-history/brief.md': FILED });
		await assignFolder(store, 'alert-history', null);
		expect(files['projects/alert-history/brief.md']).toBe(BRIEF);
		expect(messages).toEqual(['alert-history: taken out of its folder']);
	});

	it('writes nothing when the folder is the one it is in', async () => {
		const { store, writes } = said({ 'projects/alert-history/brief.md': FILED });
		await assignFolder(store, 'alert-history', ' Admin ');
		expect(writes).toEqual([]);
	});

	it('keeps the folder when a prototype is started on a project whose brief has a folder and no heading', async () => {
		const { store, files } = said({ 'projects/alert-history/brief.md': '---\nfolder: Admin\n---\n' });
		await recordPrototype(store, { projectId: 'alert-history', title: 'Alert history', note: 'Past alerts', me: null });
		expect(files['projects/alert-history/brief.md']).toBe('---\nfolder: Admin\n---\n# Alert history\n\nPast alerts\n');
	});

	it('puts a new project in the folder it is started in', async () => {
		const { store, files } = said({});
		await recordPrototype(store, { projectId: 'alert-history', title: 'Alert history', note: 'Past alerts', me: null, folder: 'Admin' });
		expect(files['projects/alert-history/brief.md']).toBe('---\nfolder: Admin\n---\n# Alert history\n\nPast alerts\n');
	});

	it('leaves a project that already has a brief where it is, when a new version is started in another folder', async () => {
		const { store, files } = said({ 'projects/alert-history/brief.md': FILED });
		await recordPrototype(store, { projectId: 'alert-history', title: 'Alert history', note: 'Again', me: null, folder: 'Roles' });
		expect(files['projects/alert-history/brief.md']).toBe(FILED);
	});

	it('refuses a project with no brief, which is where the folder is kept', async () => {
		const { store } = said({});
		await expect(assignFolder(store, 'alert-history', 'Admin')).rejects.toThrow('alert-history has no brief, which is where its folder is kept.');
	});
});

describe('the folders in use', () => {
	const p = (id: string, folder: string | null): Project => ({ id, title: id, records: [], iterations: [], people: [], folder });

	it('are each folder a project is in, once whatever its case, as the first project in the list spells it, in order', () => {
		expect(foldersOf([p('a', 'roles'), p('b', 'Admin'), p('c', 'ROLES'), p('d', null), p('e', 'admin')])).toEqual(['Admin', 'roles']);
	});

	it('are one folder for two spellings that differ only by case', () => {
		expect(sameFolder('Admin', 'admin')).toBe(true);
		expect(sameFolder('Admin', 'Admins')).toBe(false);
	});

	it('hold a project when it is in that folder, all of them for all folders, and those in none for no folder', () => {
		expect(inFolder(p('a', 'Admin'), { kind: 'folder', name: 'admin' })).toBe(true);
		expect(inFolder(p('a', 'Admin'), { kind: 'folder', name: 'Roles' })).toBe(false);
		expect(inFolder(p('a', 'Admin'), { kind: 'all' })).toBe(true);
		expect(inFolder(p('a', null), { kind: 'none' })).toBe(true);
		expect(inFolder(p('a', 'Admin'), { kind: 'none' })).toBe(false);
	});
});
