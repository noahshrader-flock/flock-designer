import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { contentHashOf } from './prototype';
import { versionFile } from './versionFiles';

/**
 * The source this machine last saved for a version, as a hash, kept beside its working copy. Saving writes the working
 * copy over the design repository's: without this, an edit made to the saved copy since (by someone else, or by an agent
 * that found it first) would be replaced without a word, and git cannot say it was not DSNR's, as DSNR commits within a minute.
 */
const savedFile = (prototypesRoot: string, projectId: string, name: string): string => versionFile(prototypesRoot, projectId, name, '.saved');

/** Null for a version saved before this was kept, or never: nothing then says what the saved copy should be. */
export const savedHash = (prototypesRoot: string, projectId: string, name: string): string | null => {
	const file = savedFile(prototypesRoot, projectId, name);
	return existsSync(file) ? readFileSync(file, 'utf8').trim() : null;
};

export const markSaved = (prototypesRoot: string, projectId: string, name: string, source: string): void => {
	const file = savedFile(prototypesRoot, projectId, name);
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, `${contentHashOf(source)}\n`);
};
