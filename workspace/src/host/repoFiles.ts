import { asArray, asRecord } from '../shared/json';
import type { RepoRef } from '../shared/repoRef';
import type { GitHubApi } from './designRepo';
import { hostErrorKind } from './hostError';

/** Where a repository is in the host's API: every call about it starts here. */
export const repoPath = (ref: RepoRef): string => `/repos/${ref.owner}/${ref.repo}`;

/**
 * A repository's files through the host's API, whoever is asking (the app's session, the person's command line, a page on
 * the published site): read, written, listed and dated, and the branches a change is kept on. Nothing here knows what
 * the files are for.
 */
export class RepoFiles {
	constructor(
		private readonly session: GitHubApi,
		private readonly ref: RepoRef,
	) {}

	private get base(): string {
		return repoPath(this.ref);
	}

	/** What a folder holds: each entry's name and whether it is a file or a folder (`dir`). */
	async list(dir: string): Promise<{ name: string; type: string }[]> {
		return asArray(await this.session.api(`${this.base}/contents/${dir}`))
			.map(asRecord)
			.filter((e) => typeof e.name === 'string')
			.map((e) => ({ name: String(e.name), type: String(e.type) }));
	}

	/** The commits that changed `path`, newest first, as the host lists them: up to a hundred. */
	async commits(path: string): Promise<Record<string, unknown>[]> {
		return asArray(await this.session.api(`${this.base}/commits?path=${path}&per_page=100`)).map(asRecord);
	}

	/** The repository's default branch, which is not always `main`. */
	async defaultBranch(): Promise<string> {
		const repo = asRecord(await this.session.api(this.base));
		if (typeof repo.default_branch !== 'string') throw new Error(`GitHub did not say which branch is ${this.ref.repo}’s default.`);
		return repo.default_branch;
	}

	/** Any file, as text, or null when there is none. */
	async readFile(path: string): Promise<string | null> {
		return (await this.readFileAt(path))?.text ?? null;
	}

	/**
	 * A file on a branch (the default one when none is named), with its blob's sha, which a write to it is made against;
	 * null when the branch or the file is not there.
	 */
	async readFileAt(path: string, ref?: string): Promise<{ text: string; sha: string } | null> {
		const file = await this.readBytesAt(path, ref);
		return file === null ? null : { text: file.bytes.toString('utf8'), sha: file.sha };
	}

	/** Any file as the bytes it is (a picture), or null when there is none. */
	async readBytes(path: string): Promise<Buffer | null> {
		return (await this.readBytesAt(path))?.bytes ?? null;
	}

	/** A file's bytes and its sha, or null when it is not there. Every read goes through here, a file of any size included. */
	async readBytesAt(path: string, ref?: string): Promise<{ bytes: Buffer; sha: string } | null> {
		try {
			const file = asRecord(await this.session.api(`${this.base}/contents/${path}${ref ? `?ref=${encodeURIComponent(ref)}` : ''}`));
			if (typeof file.sha !== 'string') return null;
			// Over 1 MB, the contents API leaves the content out; the blob it names carries it, up to 100 MB.
			const content = file.encoding === 'none' ? asRecord(await this.session.api(`${this.base}/git/blobs/${file.sha}`)).content : file.content;
			return typeof content === 'string' ? { bytes: Buffer.from(content, 'base64'), sha: file.sha } : null;
		} catch (err) {
			if (hostErrorKind(err) === 'notFound') return null;
			throw err;
		}
	}

	/** A file's blob sha on the default branch, or null when it is not there: its details only, so it stays cheap whatever its size. */
	private async shaAt(path: string): Promise<string | null> {
		try {
			const file = asRecord(await this.session.api(`${this.base}/contents/${path}`));
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
	 * One commit of `path` as `content`: on `branch` (the default one when none is named), replacing the blob `sha` (none
	 * for a new file). A file that is not that one any more is refused by the host, as a conflict.
	 */
	async putFile(
		path: string,
		content: string | Buffer,
		message: string,
		{ branch, sha }: { branch?: string; sha?: string | null } = {},
	): Promise<void> {
		await this.session.api(`${this.base}/contents/${path}`, {
			method: 'PUT',
			body: {
				message,
				...(branch ? { branch } : {}),
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
		const put = async () => this.putFile(path, content, message, { sha: await this.shaAt(path) });
		try {
			await put();
		} catch (err) {
			// Someone else changed it between the read and the write: read again and write once more.
			if (hostErrorKind(err) === 'conflict') return put();
			if (hostErrorKind(err) === 'forbidden' || hostErrorKind(err) === 'notFound') {
				throw new Error('Saving needs write access to the design repository. Ask someone who has it to add you.');
			}
			throw err;
		}
	}

	/** The commit a branch is at. */
	async branchHead(branch: string): Promise<string> {
		const sha = asRecord(asRecord(await this.session.api(`${this.base}/git/ref/heads/${encodeURIComponent(branch)}`)).object).sha;
		if (typeof sha !== 'string') throw new Error(`GitHub did not say where ${branch} is.`);
		return sha;
	}

	/** A new branch, at `sha`. */
	async createBranch(branch: string, sha: string): Promise<void> {
		await this.session.api(`${this.base}/git/refs`, { method: 'POST', body: { ref: `refs/heads/${branch}`, sha } });
	}

	async deleteBranch(branch: string): Promise<void> {
		await this.session.api(`${this.base}/git/refs/heads/${encodeURIComponent(branch)}`, { method: 'DELETE' });
	}
}
