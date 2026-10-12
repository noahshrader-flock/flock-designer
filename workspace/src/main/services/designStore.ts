import type { DesignRepo } from './designRepo';
import { type RecordStore, cloneStore } from './prototype';

/**
 * Where the app reads and writes the design repository's files: its clone on this machine when there is one (written
 * there, then published), else GitHub. A file the clone does not have yet (a colleague's work not pulled) is read from
 * GitHub too, when there is a GitHub to ask (`designRepo`); the command line, which works in a clone, has none.
 */
export const designStore = ({
	clone,
	designRepo,
	onWrite,
}: {
	/** The design repository's clone here, or null. */
	clone: () => string | null;
	designRepo: Pick<DesignRepo, 'readFile' | 'readBytes' | 'hasFile' | 'writeFile'> | null;
	/** Run after anything is written to the clone: publishing it. */
	onWrite: () => void;
}) => {
	const records = (): RecordStore => {
		const here = clone();
		if (here !== null) return cloneStore(here, onWrite);
		if (designRepo === null) throw new Error('There is no design repository here to read or write.');
		return {
			read: (path) => designRepo.readFile(path),
			readBytes: (path) => designRepo.readBytes(path),
			has: (path) => designRepo.hasFile(path),
			write: (path, content, message) => designRepo.writeFile(path, content, message),
		};
	};
	/** Without a clone the store already is GitHub, so it is asked once. */
	const orFromGitHub = async <T>(here: T | null, there: (repo: NonNullable<typeof designRepo>) => Promise<T | null>): Promise<T | null> =>
		here !== null || clone() === null || designRepo === null ? here : there(designRepo);
	return {
		records,
		/** A file, as text. */
		readFile: async (path: string): Promise<string | null> => orFromGitHub(await records().read(path), (repo) => repo.readFile(path)),
		/** A file's bytes: a picture. */
		readBytes: async (path: string): Promise<Buffer | null> => orFromGitHub(await records().readBytes(path), (repo) => repo.readBytes(path)),
	};
};
