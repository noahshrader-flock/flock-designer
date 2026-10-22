import { isAbsolute } from 'node:path';
import { asRecord } from '../../../shared/json';
import { type JsonFile, jsonFile } from '../platform/jsonFile';

/**
 * Only a hint: whoever reads it checks it again before use, so a stale or edited file can do nothing the person could not.
 */
export class FolderMemory {
	private readonly file: JsonFile<Record<string, unknown>>;

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

	write(folder: string): void {
		this.file.write({ [this.key]: folder });
	}
}
