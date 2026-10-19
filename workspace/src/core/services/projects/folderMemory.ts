import { isAbsolute } from 'node:path';
import { asRecord } from '../../../shared/json';
import { type JsonFile, jsonFile } from '../platform/jsonFile';

/**
 * One folder remembered for a person in its own small file (the product checkout they chose, where clones go). Only a
 * hint: whoever reads it checks it again before use, so a stale or edited file can do nothing the person could not.
 */
export class FolderMemory {
	private readonly file: JsonFile<Record<string, unknown>>;

	/** `key` is the field the path is kept under, which differs by file. */
	constructor(
		path: string,
		private readonly key: string,
	) {
		this.file = jsonFile(path, { parse: asRecord, fallback: {} });
	}

	/** The folder kept, or null when none was, or what was kept is not an absolute path. */
	read(): string | null {
		const kept = this.file.read()[this.key];
		return typeof kept === 'string' && isAbsolute(kept) ? kept : null;
	}

	/** Not kept, the person is asked again next time, or the default is used. */
	write(folder: string): void {
		this.file.write({ [this.key]: folder });
	}
}
