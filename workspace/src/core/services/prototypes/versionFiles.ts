import { join } from 'node:path';
import { isPrototypeName } from '../../../shared/prototypeNames';
import { assertUsableProjectId } from '../projects/workRecords';

/** A file this machine keeps beside a version's built files, named for the version: only ever a project's own, and a version's. */
export const versionFile = (prototypesRoot: string, projectId: string, name: string, suffix: string): string => {
	assertUsableProjectId(projectId);
	if (!isPrototypeName(name)) throw new Error(`"${name}" is not a prototype.`);
	return join(prototypesRoot, projectId, `${name}${suffix}`);
};
