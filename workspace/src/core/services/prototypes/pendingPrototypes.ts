import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Work } from '../../../shared/contract';
import { isVersionName } from '../../../shared/versionNames';
import { parseWork, serializeWork } from '../../../shared/workRecords';
import { assertUsablePrototypeId } from './workRecords';
import { versionFile } from './versionFiles';

/**
 * A version started here and not saved yet: its record, kept on this machine only, beside its built files, in the shape
 * `work.json` keeps it. Nothing of it is shared until its first page is saved, so walking away leaves no trace for anyone.
 */

const SUFFIX = '.pending.json';

const pendingFile = (prototypesRoot: string, prototypeId: string, name: string): string => versionFile(prototypesRoot, prototypeId, name, SUFFIX);

export const keepPending = (prototypesRoot: string, record: Work): void => {
	const file = pendingFile(prototypesRoot, record.prototypeId, record.name);
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, serializeWork([record]));
};

/** One that cannot be read is no start: it is never recorded from a guess. */
export const pendingOf = (prototypesRoot: string, prototypeId: string): Work[] => {
	assertUsablePrototypeId(prototypeId);
	const dir = join(prototypesRoot, prototypeId);
	if (!existsSync(dir)) return [];
	return readdirSync(dir)
		.filter((f) => f.endsWith(SUFFIX) && isVersionName(f.slice(0, -SUFFIX.length)))
		.flatMap((f) => {
			const [record] = parseWork(readFileSync(join(dir, f), 'utf8')) ?? [];
			return record && record.prototypeId === prototypeId && `${record.name}${SUFFIX}` === f ? [record] : [];
		});
};

export const dropPending = (prototypesRoot: string, prototypeId: string, name: string): void =>
	rmSync(pendingFile(prototypesRoot, prototypeId, name), { force: true });

export const dropAllPending = (prototypesRoot: string, prototypeId: string): void => {
	for (const r of pendingOf(prototypesRoot, prototypeId)) dropPending(prototypesRoot, prototypeId, r.name);
};

/** As the records sync asks it: whether a prototype has a start here. */
export const startedHere =
	(prototypesRoot: string) =>
	(prototypeId: string): boolean => {
		try {
			return pendingOf(prototypesRoot, prototypeId).length > 0;
		} catch {
			return false;
		}
	};

/** Every start on this machine; a folder that is not a prototype's is passed over. */
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
