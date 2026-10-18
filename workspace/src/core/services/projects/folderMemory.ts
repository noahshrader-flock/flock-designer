import { isAbsolute } from 'node:path';
import { asRecord } from '../../../shared/json';
import { type JsonFile, jsonFile } from '../platform/jsonFile';

/**
 * One folder the app remembers for a person, in its own small file in the app's settings: the product checkout they
 * chose, where their clones go. (The design systems connected are a list, kept by `DesignSystemsMemory`.)
 *
 * Only the path is kept, and only as a hint: whoever reads it checks it again before using it, so a stale or edited file
 * can do nothing the person could not have done themselves. Not remembering is an inconvenience, never a failure.
 */
export class FolderMemory {
	private readonly file: JsonFile<Record<string, unknown>>;

	/** `key` is the field the path is kept under, which is what each file has always used. */
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
