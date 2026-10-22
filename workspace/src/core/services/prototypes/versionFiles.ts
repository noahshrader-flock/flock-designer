import { join } from 'node:path';
import { isVersionName } from '../../../shared/versionNames';
import { assertUsableProjectId } from '../projects/workRecords';

/** A file this machine keeps beside a version's built files, named for the version: only ever a project's own, and a version's. */
export const versionFile = (prototypesRoot: string, projectId: string, name: string, suffix: string): string => {
	assertUsableProjectId(projectId);
	if (!isVersionName(name)) throw new Error(`"${name}" is not a prototype.`);
	return join(prototypesRoot, projectId, `${name}${suffix}`);
};
