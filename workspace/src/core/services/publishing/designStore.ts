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
	/** The design repository's files over the API, asked each time: the one the open product belongs to. */
	files: () => Pick<RepoFiles, 'readFile' | 'readBytes' | 'hasFile' | 'writeFile'> | null;
	onWrite: () => void;
}) => {
	const records = (): RecordStore => {
		const here = clone();
		if (here !== null) return cloneStore(here, onWrite);
		const api = files();
		if (api === null) throw new Error('There is no design repository here to read or write.');
		return {
			read: (path) => api.readFile(path),
			readBytes: (path) => api.readBytes(path),
			has: (path) => api.hasFile(path),
			write: (path, content, message) => api.writeFile(path, content, message),
		};
	};
	/** Without a clone the store already is GitHub, so it is asked once. */
	const orFromGitHub = async <T>(here: T | null, there: (repo: NonNullable<ReturnType<typeof files>>) => Promise<T | null>): Promise<T | null> => {
		if (here !== null || clone() === null) return here;
		const api = files();
		return api === null ? here : there(api);
	};
	return {
		records,
		readFile: async (path: string): Promise<string | null> => orFromGitHub(await records().read(path), (repo) => repo.readFile(path)),
		readBytes: async (path: string): Promise<Buffer | null> => orFromGitHub(await records().readBytes(path), (repo) => repo.readBytes(path)),
	};
};
