import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute } from 'node:path';

/**
 * One folder the app remembers for a person, in its own small file in the app's settings: the product checkout they
 * chose, where their clones go, the design system they connected.
 *
 * Only the path is kept, and only as a hint: whoever reads it checks it again before using it, so a stale or edited file
 * can do nothing the person could not have done themselves. Not remembering is an inconvenience, never a failure.
 */
export class FolderMemory {
	/** `key` is the field the path is kept under, which is what each file has always used. */
	constructor(
		private readonly file: string,
		private readonly key: string,
	) {}

	/** The folder kept, or null when none was, or what was kept is not an absolute path. */
	read(): string | null {
		try {
			const kept = (JSON.parse(readFileSync(this.file, 'utf8')) as Record<string, unknown>)[this.key];
			return typeof kept === 'string' && isAbsolute(kept) ? kept : null;
		} catch {
			return null;
		}
	}

	write(folder: string): void {
		try {
			mkdirSync(dirname(this.file), { recursive: true });
			writeFileSync(this.file, JSON.stringify({ [this.key]: folder }));
		} catch {
			// The person is asked again next time, or the default is used.
		}
	}
}
