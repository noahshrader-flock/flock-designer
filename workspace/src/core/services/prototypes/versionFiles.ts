import { join } from 'node:path';
import { isVersionName } from '../../../shared/versionNames';
import { assertUsablePrototypeId } from './workRecords';

/** A file this machine keeps beside a version's built files, named for the version: only ever a prototype's own, and a version's. */
export const versionFile = (prototypesRoot: string, prototypeId: string, name: string, suffix: string): string => {
	assertUsablePrototypeId(prototypeId);
	if (!isVersionName(name)) throw new Error(`"${name}" is not a prototype.`);
	return join(prototypesRoot, prototypeId, `${name}${suffix}`);
};
