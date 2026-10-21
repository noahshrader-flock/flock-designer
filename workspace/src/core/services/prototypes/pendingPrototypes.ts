import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Work } from '../../../shared/contract';
import { isPrototypeName } from '../../../shared/prototypeNames';
import { parseWork, serializeWork } from '../../../shared/workRecords';
import { assertUsableProjectId } from '../projects/workRecords';
import { versionFile } from './versionFiles';

/**
 * A version started here and not saved yet: its record, kept on this machine only, beside its built files, in the shape
 * `work.json` keeps it. Nothing of it is shared until its first page is saved, so walking away leaves no trace for anyone.
 */

const SUFFIX = '.pending.json';

const pendingFile = (prototypesRoot: string, projectId: string, name: string): string => versionFile(prototypesRoot, projectId, name, SUFFIX);

export const keepPending = (prototypesRoot: string, record: Work): void => {
	const file = pendingFile(prototypesRoot, record.projectId, record.name);
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, serializeWork([record]));
};

/** One that cannot be read is no start: it is never recorded from a guess. */
export const pendingOf = (prototypesRoot: string, projectId: string): Work[] => {
	assertUsableProjectId(projectId);
	const dir = join(prototypesRoot, projectId);
	if (!existsSync(dir)) return [];
	return readdirSync(dir)
		.filter((f) => f.endsWith(SUFFIX) && isPrototypeName(f.slice(0, -SUFFIX.length)))
		.flatMap((f) => {
			const [record] = parseWork(readFileSync(join(dir, f), 'utf8')) ?? [];
			return record && record.projectId === projectId && `${record.name}${SUFFIX}` === f ? [record] : [];
		});
};

export const dropPending = (prototypesRoot: string, projectId: string, name: string): void =>
	rmSync(pendingFile(prototypesRoot, projectId, name), { force: true });

export const dropAllPending = (prototypesRoot: string, projectId: string): void => {
	for (const r of pendingOf(prototypesRoot, projectId)) dropPending(prototypesRoot, projectId, r.name);
};

/** As the records sync asks it: whether a project has a start here. */
export const startedHere =
	(prototypesRoot: string) =>
	(projectId: string): boolean => {
		try {
			return pendingOf(prototypesRoot, projectId).length > 0;
		} catch {
			return false;
		}
	};

/** Every start on this machine; a folder that is not a project's is passed over. */
export const pendingHere = (prototypesRoot: string): Work[] =>
	existsSync(prototypesRoot)
		? readdirSync(prototypesRoot, { withFileTypes: true })
				.filter((d) => d.isDirectory() && !d.name.startsWith('_'))
				.flatMap((d) => {
					try {
						return pendingOf(prototypesRoot, d.name);
					} catch {
						return [];
					}
				})
		: [];
