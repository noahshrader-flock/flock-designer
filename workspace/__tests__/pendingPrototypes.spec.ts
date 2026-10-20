import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { dropAllPending, dropPending, keepPending, pendingOf, pendingHere, startedHere } from '../src/core/services/prototypes/pendingPrototypes';

let root: string;
beforeEach(() => void (root = mkdtempSync(join(tmpdir(), 'fd-pending-'))));
afterEach(() => rmSync(root, { recursive: true, force: true }));

const record = (projectId: string, name: string) => ({
	projectId,
	name,
	branch: `prototype/${projectId}/${name}`,
	commit: null,
	createdAt: '2026-10-20T10:00:00.000Z',
	note: 'n',
	basedOn: { repository: 'flock-coke', branch: 'develop', commit: 'abc1234' },
});

describe('a prototype started here and not saved', () => {
	it('is kept as its record will be, read back whole, with every start here, and known by its project', () => {
		keepPending(root, record('widgets', 'v1'));
		keepPending(root, record('widgets', 'v2'));
		expect(pendingOf(root, 'widgets')).toEqual([record('widgets', 'v1'), record('widgets', 'v2')]);
		keepPending(root, record('maps', 'v1'));
		expect(pendingHere(root).map((r) => `${r.projectId} ${r.name}`)).toEqual(['maps v1', 'widgets v1', 'widgets v2']);
		expect(startedHere(root)('widgets')).toBe(true);
		expect(startedHere(root)('other')).toBe(false);
	});

	it('is cleared one version at a time, or all of a project at once', () => {
		keepPending(root, record('widgets', 'v1'));
		keepPending(root, record('widgets', 'v2'));
		dropPending(root, 'widgets', 'v1');
		expect(pendingOf(root, 'widgets').map((r) => r.name)).toEqual(['v2']);
		dropAllPending(root, 'widgets');
		expect(pendingHere(root)).toEqual([]);
	});

	it('is never read from a file that cannot be read, or that names another version or project than its name says', () => {
		mkdirSync(join(root, 'widgets'), { recursive: true });
		writeFileSync(join(root, 'widgets', 'v1.pending.json'), '{not json');
		writeFileSync(join(root, 'widgets', 'v2.pending.json'), JSON.stringify([record('widgets', 'v3')]));
		writeFileSync(join(root, 'widgets', 'v4.pending.json'), JSON.stringify([record('other', 'v4')]));
		expect(pendingOf(root, 'widgets')).toEqual([]);
	});

	it('is kept apart from what is built here, and from the folders that are not projects', () => {
		mkdirSync(join(root, '_shared'), { recursive: true });
		mkdirSync(join(root, 'built'), { recursive: true });
		writeFileSync(join(root, 'built', 'v1.html'), '<p>');
		expect(pendingHere(root)).toEqual([]);
	});
});
