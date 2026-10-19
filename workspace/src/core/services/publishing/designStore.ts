import type { RepoFiles } from '../../../codeHost/repoFiles';
import { type RecordStore, cloneStore } from '../prototypes/prototype';

/**
 * The clone when there is one, else GitHub. A file the clone does not have yet (a colleague's work not pulled) is read
 * from GitHub too, when there is one to ask (`files`); the command line has none.
 */
export const designStore = ({
	clone,
	files,
	onWrite,
}: {
	clone: () => string | null;
	files: Pick<RepoFiles, 'readFile' | 'readBytes' | 'hasFile' | 'writeFile'> | null;
	onWrite: () => void;
}) => {
	const records = (): RecordStore => {
		const here = clone();
		if (here !== null) return cloneStore(here, onWrite);
		if (files === null) throw new Error('There is no design repository here to read or write.');
		return {
			read: (path) => files.readFile(path),
			readBytes: (path) => files.readBytes(path),
			has: (path) => files.hasFile(path),
			write: (path, content, message) => files.writeFile(path, content, message),
		};
	};
	/** Without a clone the store already is GitHub, so it is asked once. */
	const orFromGitHub = async <T>(here: T | null, there: (repo: NonNullable<typeof files>) => Promise<T | null>): Promise<T | null> =>
		here !== null || clone() === null || files === null ? here : there(files);
	return {
		records,
		readFile: async (path: string): Promise<string | null> => orFromGitHub(await records().read(path), (repo) => repo.readFile(path)),
		readBytes: async (path: string): Promise<Buffer | null> => orFromGitHub(await records().readBytes(path), (repo) => repo.readBytes(path)),
	};
};
