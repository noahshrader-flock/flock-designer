import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Prototype } from '../src/shared/contract';
import { DesignRepo } from '../src/codeHost/designRepo';
import { readFolderPrototypes } from '../src/core/services/prototypes/localPrototypes';
import { assignFolder, deletePrototype, renamePrototype, startPrototype, type RecordStore } from '../src/core/services/prototypes/prototype';
import {
	briefFolder,
	firstHeading,
	folderName,
	foldersOf,
	inFolder,
	namesPrototype,
	prototypeTitle,
	sameFolder,
	withFolder,
	withTitle,
} from '../src/shared/brief';
import { prototypeDir, prototypePath } from '../src/shared/designPaths';
import { mergePrototypes } from '../src/shared/prototypeList';
import { b64, fakeGitHub } from './fakes/github';
import { memoryStore } from './fixtures';

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

describe('a prototype’s path', () => {
	it('is built in one place, for the prototype and for a file in it', () => {
		expect(prototypeDir('alpha')).toBe('prototypes/alpha');
		expect(prototypePath('alpha', 'brief.md')).toBe('prototypes/alpha/brief.md');
	});
});

describe('reading a prototype’s folder', () => {
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
		const byId = new Map(readFolderPrototypes(root).map((p) => [p.id, p]));
		expect(byId.get('alert-history')).toMatchObject({ title: 'Alert history', folder: 'Admin' });
		expect(byId.get('loose')).toMatchObject({ title: 'Loose', folder: null });
	});

	it('is read from GitHub’s copy of the brief, in the same request as its title', async () => {
		const { github, api } = fakeGitHub({
			'/repos/acme/design/contents/prototypes/alpha/brief.md*': { sha: 'f1', content: b64(FILED) },
			'/repos/acme/design/contents/prototypes/alpha*': [{ type: 'file', name: 'brief.md' }],
			'/repos/acme/design/contents/prototypes/beta*': [],
			'/repos/acme/design/contents/prototypes*': [
				{ type: 'dir', name: 'alpha' },
				{ type: 'dir', name: 'beta' },
			],
			'/repos/acme/design/commits*': [],
			'/repos/acme/design/issues*': [],
		});
		const list = await new DesignRepo(github, { owner: 'acme', repo: 'design' }).listPrototypes();
		const byId = new Map(list.map((p) => [p.id, p]));
		expect(byId.get('alpha')).toMatchObject({ title: 'Alert history', folder: 'Admin' });
		expect(byId.get('beta')).toMatchObject({ title: 'beta', folder: null });
		expect(api.mock.calls.filter(([p]) => String(p).endsWith('/brief.md'))).toHaveLength(1);
	});
});

describe('a prototype’s folder, when this machine and GitHub both know the prototype', () => {
	const prototype = (over: Partial<Prototype>): Prototype => ({
		id: 'alpha',
		title: 'Alpha',
		folder: null,
		records: ['brief.md'],
		work: [],
		people: [],
		...over,
	});

	it('is this machine’s, which is the one last written here and is synced from GitHub before every write', () => {
		const [merged] = mergePrototypes([prototype({ folder: 'Admin' })], [prototype({ folder: 'Roles' })]);
		expect(merged?.folder).toBe('Roles');
		const [cleared] = mergePrototypes([prototype({ folder: 'Admin' })], [prototype({ folder: null })]);
		expect(cleared?.folder).toBeNull();
	});

	it('is GitHub’s when this machine has no brief for it', () => {
		const [merged] = mergePrototypes([prototype({ folder: 'Admin' })], [prototype({ records: [], folder: null })]);
		expect(merged?.folder).toBe('Admin');
	});
});

describe('assigning a prototype a folder', () => {
	const said = (files: Record<string, string>) => {
		const { store, writes } = memoryStore(files);
		const messages: string[] = [];
		const telling: RecordStore = { ...store, write: async (p, c, m) => (messages.push(m), store.write(p, c, m)) };
		return { store: telling, files, writes, messages };
	};

	it('writes the folder into the brief, saying so, and nothing else', async () => {
		const { store, files, writes, messages } = said({ 'prototypes/alert-history/brief.md': BRIEF });
		await assignFolder(store, 'alert-history', 'Admin');
		expect(files['prototypes/alert-history/brief.md']).toBe(FILED);
		expect(writes).toEqual(['prototypes/alert-history/brief.md']);
		expect(messages).toEqual(['alert-history: put in the folder Admin']);
	});

	it('takes it out of its folder', async () => {
		const { store, files, messages } = said({ 'prototypes/alert-history/brief.md': FILED });
		await assignFolder(store, 'alert-history', null);
		expect(files['prototypes/alert-history/brief.md']).toBe(BRIEF);
		expect(messages).toEqual(['alert-history: taken out of its folder']);
	});

	it('writes nothing when the folder is the one it is in', async () => {
		const { store, writes } = said({ 'prototypes/alert-history/brief.md': FILED });
		await assignFolder(store, 'alert-history', ' Admin ');
		expect(writes).toEqual([]);
	});

	it('keeps the folder when a prototype is started on a prototype whose brief has a folder and no heading', async () => {
		const { store, files } = said({ 'prototypes/alert-history/brief.md': '---\nfolder: Admin\n---\n' });
		await startPrototype(store, { prototypeId: 'alert-history', title: 'Alert history', note: 'Past alerts', me: null });
		expect(files['prototypes/alert-history/brief.md']).toBe('---\nfolder: Admin\n---\n# Alert history\n\nPast alerts\n');
	});

	it('puts a new prototype in the folder it is started in', async () => {
		const { store, files } = said({});
		await startPrototype(store, { prototypeId: 'alert-history', title: 'Alert history', note: 'Past alerts', me: null, folder: 'Admin' });
		expect(files['prototypes/alert-history/brief.md']).toBe('---\nfolder: Admin\n---\n# Alert history\n\nPast alerts\n');
	});

	it('leaves a prototype that already has a brief where it is, when a new version is started in another folder', async () => {
		const { store, files } = said({ 'prototypes/alert-history/brief.md': FILED });
		await startPrototype(store, { prototypeId: 'alert-history', title: 'Alert history', note: 'Again', me: null, folder: 'Roles' });
		expect(files['prototypes/alert-history/brief.md']).toBe(FILED);
	});

	it('refuses a prototype with no brief, which is where the folder is kept', async () => {
		const { store } = said({});
		await expect(assignFolder(store, 'alert-history', 'Admin')).rejects.toThrow('alert-history has no brief, which is where its folder is kept.');
	});
});

describe('a prototype’s name, the one people see', () => {
	it('is kept on one line, its spaces single, and is nothing when nothing is left', () => {
		expect(prototypeTitle('  Alert   history\n v2 ')).toBe('Alert history v2');
		expect(prototypeTitle(' \n ')).toBeNull();
	});

	it('is its brief’s first heading, written in place, with the folder and the rest of the brief kept', () => {
		expect(withTitle(FILED, 'Alerts over time')).toBe(FILED.replace('# Alert history', '# Alerts over time'));
		// A heading in the brief's own text is the person's, not the name.
		expect(withTitle('# Alert history\n\n# Notes\n', 'Alerts')).toBe('# Alerts\n\n# Notes\n');
		expect(withTitle('---\nfolder: Admin\n---\nPast alerts\n', 'Alerts')).toBe('---\nfolder: Admin\n---\n# Alerts\n\nPast alerts\n');
	});
});

describe('renaming a prototype', () => {
	const said = (files: Record<string, string>) => {
		const { store, writes } = memoryStore(files);
		const messages: string[] = [];
		const telling: RecordStore = { ...store, write: async (p, c, m) => (messages.push(m), store.write(p, c, m)) };
		return { store: telling, files, writes, messages };
	};

	it('writes the new name into its brief, saying so, and nothing else: its id and folder stay', async () => {
		const { store, files, writes, messages } = said({ 'prototypes/alert-history/brief.md': FILED });
		await renamePrototype(store, 'alert-history', '  Alerts  over time ');
		expect(files['prototypes/alert-history/brief.md']).toBe(FILED.replace('# Alert history', '# Alerts over time'));
		expect(writes).toEqual(['prototypes/alert-history/brief.md']);
		expect(messages).toEqual(['alert-history: renamed to Alerts over time']);
	});

	it('writes nothing when the name is the one it has', async () => {
		const { store, writes } = said({ 'prototypes/alert-history/brief.md': FILED });
		await renamePrototype(store, 'alert-history', ' Alert history ');
		expect(writes).toEqual([]);
	});

	it('refuses no name, and a prototype with no brief, which is where its name is kept', async () => {
		await expect(renamePrototype(said({ 'prototypes/alert-history/brief.md': FILED }).store, 'alert-history', '  ')).rejects.toThrow(
			'Give it a name.',
		);
		await expect(renamePrototype(said({}).store, 'alert-history', 'Alerts')).rejects.toThrow(
			'alert-history has no brief, which is where its name is kept.',
		);
	});
});

describe('deleting a prototype', () => {
	const said = (files: Record<string, string>) => {
		const { store, removed } = memoryStore(files);
		const messages: string[] = [];
		const telling: RecordStore = { ...store, remove: async (d, m) => (messages.push(m), store.remove(d, m)) };
		return { store: telling, files, removed, messages };
	};
	const PROTOTYPE = {
		'prototypes/alert-history/brief.md': FILED,
		'prototypes/alert-history/work.json': '[]',
		'prototypes/alert-history/v1.html': '<p>',
		'prototypes/alert-history-2/brief.md': '# Alert history two\n',
	};

	it('is asked for by its name as people see it, exactly, spaces at either end aside', () => {
		expect(namesPrototype('  Alert history ', 'Alert history')).toBe(true);
		expect(namesPrototype('alert history', 'Alert history')).toBe(false);
		expect(namesPrototype('Alert  history', 'Alert history')).toBe(false);
		expect(namesPrototype('', 'Alert history')).toBe(false);
	});

	it('removes its whole folder, every version with it, as one change saying so, and nothing of another prototype', async () => {
		const { store, files, removed, messages } = said({ ...PROTOTYPE });
		await deletePrototype(store, 'alert-history', 'Alert history');
		expect(removed).toEqual(['prototypes/alert-history']);
		expect(messages).toEqual(['alert-history: deleted']);
		expect(Object.keys(files)).toEqual(['prototypes/alert-history-2/brief.md']);
	});

	it('refuses any other name, saying the one to type, and removes nothing', async () => {
		const { store, removed } = said({ ...PROTOTYPE });
		await expect(deletePrototype(store, 'alert-history', 'alert history')).rejects.toThrow('Type Alert history to delete it.');
		await expect(deletePrototype(store, 'alert-history', 'alert-history')).rejects.toThrow('Type Alert history to delete it.');
		expect(removed).toEqual([]);
	});

	it('takes its id for its name when it has no brief, as the list shows it, and refuses a prototype that is not there', async () => {
		const { store, removed } = said({ 'prototypes/zones/work.json': '[]' });
		await deletePrototype(store, 'zones', 'zones');
		expect(removed).toEqual(['prototypes/zones']);
		await expect(deletePrototype(said({}).store, 'zones', 'zones')).rejects.toThrow('There is no prototype zones to delete.');
	});
});

describe('the folders in use', () => {
	const p = (id: string, folder: string | null): Prototype => ({ id, title: id, records: [], work: [], people: [], folder });

	it('are each folder a prototype is in, once whatever its case, as the first prototype in the list spells it, in order', () => {
		expect(foldersOf([p('a', 'roles'), p('b', 'Admin'), p('c', 'ROLES'), p('d', null), p('e', 'admin')])).toEqual(['Admin', 'roles']);
	});

	it('are one folder for two spellings that differ only by case', () => {
		expect(sameFolder('Admin', 'admin')).toBe(true);
		expect(sameFolder('Admin', 'Admins')).toBe(false);
	});

	it('hold a prototype when it is in that folder, all of them for all folders, and those in none for no folder', () => {
		expect(inFolder(p('a', 'Admin'), { kind: 'folder', name: 'admin' })).toBe(true);
		expect(inFolder(p('a', 'Admin'), { kind: 'folder', name: 'Roles' })).toBe(false);
		expect(inFolder(p('a', 'Admin'), { kind: 'all' })).toBe(true);
		expect(inFolder(p('a', null), { kind: 'none' })).toBe(true);
		expect(inFolder(p('a', 'Admin'), { kind: 'none' })).toBe(false);
	});
});
