import { asArray, asRecord } from '../shared/json';
import { type RepoRef, formatRepo } from '../shared/repoRef';
import type { GitHubApi } from './github';
import { HostError, hostErrorKind } from './hostError';
import { HOST } from '../shared/vocabulary';

/** What is said when saving to `ref` is refused: the person may read it, and not write to it. */
export const noWriteAccess = (ref: RepoRef): HostError =>
	new HostError(`Saving needs write access to ${formatRepo(ref)}. Ask someone who has it to add you.`, 403, 'forbidden');

/** Where a repository is in the host's API: every call about it starts here. */
export const repoApiPath = (ref: RepoRef): string => `/repos/${ref.owner}/${ref.repo}`;

/**
 * A repository's files through the host's API, whoever is asking (the app's session, the person's command line, a page on
 * the published site): read, written, listed and dated. Nothing here knows what the files are for.
 */
export class RepoFiles {
	constructor(
		private readonly session: GitHubApi,
		private readonly ref: RepoRef,
	) {}

	private get apiPath(): string {
		return repoApiPath(this.ref);
	}

	/**
	 * What a folder holds: each entry's name, whether it is a file or a folder (`dir`), and its sha, which changes whenever
	 * anything in it does (null when the host gives none).
	 */
	async list(dir: string): Promise<{ name: string; type: string; sha: string | null }[]> {
		return asArray(await this.session.api(`${this.apiPath}/contents/${dir}`))
			.map(asRecord)
			.filter((e) => typeof e.name === 'string')
			.map((e) => ({ name: String(e.name), type: String(e.type), sha: typeof e.sha === 'string' ? e.sha : null }));
	}

	/** The commits that changed `path`, newest first, as the host lists them: up to `limit`, on `at` (a branch or commit) when given. */
	async commits(path: string, { at, limit = 100 }: { at?: string; limit?: number } = {}): Promise<Record<string, unknown>[]> {
		const on = at === undefined ? '' : `&sha=${encodeURIComponent(at)}`;
		return asArray(await this.session.api(`${this.apiPath}/commits?path=${encodeURIComponent(path)}${on}&per_page=${limit}`)).map(asRecord);
	}

	/** The repository's default branch, which is not always `main`. */
	async defaultBranch(): Promise<string> {
		const repo = asRecord(await this.session.api(this.apiPath));
		if (typeof repo.default_branch !== 'string') throw new Error(`${HOST} did not say which branch is ${this.ref.repo}’s default.`);
		return repo.default_branch;
	}

	/** Any file, as text, or null when there is none. */
	async readFile(path: string): Promise<string | null> {
		return (await this.readBytes(path))?.toString('utf8') ?? null;
	}

	/** Any file as the bytes it is (a picture), or null when there is none. */
	async readBytes(path: string): Promise<Buffer | null> {
		try {
			const file = asRecord(await this.session.api(`${this.apiPath}/contents/${path}`));
			if (typeof file.sha !== 'string') return null;
			// Over 1 MB, the contents API leaves the content out; the blob it names carries it, up to 100 MB.
			const content = file.encoding === 'none' ? asRecord(await this.session.api(`${this.apiPath}/git/blobs/${file.sha}`)).content : file.content;
			return typeof content === 'string' ? Buffer.from(content, 'base64') : null;
		} catch (err) {
			if (hostErrorKind(err) === 'notFound') return null;
			throw err;
		}
	}

	/** A file's blob sha on the default branch, or null when it is not there: its details only, so it stays cheap whatever its size. */
	private async shaAt(path: string): Promise<string | null> {
		try {
			const file = asRecord(await this.session.api(`${this.apiPath}/contents/${path}`));
			return typeof file.sha === 'string' ? file.sha : null;
		} catch (err) {
			if (hostErrorKind(err) === 'notFound') return null;
			throw err;
		}
	}

	/** Whether a file is there. */
	async hasFile(path: string): Promise<boolean> {
		return (await this.shaAt(path)) !== null;
	}

	/**
	 * One commit of `path` as `content` on the default branch, replacing the blob `sha` (none for a new file). A file that
	 * is not that one any more is refused by the host, as a conflict.
	 */
	private async putFile(path: string, content: string | Buffer, message: string, sha: string | null): Promise<void> {
		await this.session.api(`${this.apiPath}/contents/${path}`, {
			method: 'PUT',
			body: {
				message,
				content: (typeof content === 'string' ? Buffer.from(content, 'utf8') : content).toString('base64'),
				...(sha ? { sha } : {}),
			},
		});
	}

	/**
	 * Creates or replaces a file on the default branch, as one commit by whoever is signed in: text, or the bytes of a
	 * picture. Used only where there is no clone on this machine to write into: one writer per machine.
	 */
	async writeFile(path: string, content: string | Buffer, message: string): Promise<void> {
		const put = async () => this.putFile(path, content, message, await this.shaAt(path));
		try {
			await put();
		} catch (err) {
			// Someone else changed it between the read and the write: read again and write once more.
			if (hostErrorKind(err) === 'conflict') return put();
			if (hostErrorKind(err) === 'forbidden' || hostErrorKind(err) === 'notFound') throw noWriteAccess(this.ref);
			throw err;
		}
	}
}
