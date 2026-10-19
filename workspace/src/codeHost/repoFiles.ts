import { asArray, asRecord } from '../shared/json';
import { type RepoRef, formatRepo } from '../shared/repoRef';
import type { GitHubApi } from './github';
import { HostError, hostErrorKind } from './hostError';
import { HOST } from '../shared/vocabulary';

export const noWriteAccess = (ref: RepoRef): HostError =>
	new HostError(`Saving needs write access to ${formatRepo(ref)}. Ask someone who has it to add you.`, 403, 'forbidden');

export const repoApiPath = (ref: RepoRef): string => `/repos/${ref.owner}/${ref.repo}`;

export class RepoFiles {
	constructor(
		private readonly session: GitHubApi,
		private readonly ref: RepoRef,
	) {}

	private get apiPath(): string {
		return repoApiPath(this.ref);
	}

	/** An entry's sha changes whenever anything in it does. */
	async list(dir: string): Promise<{ name: string; type: string; sha: string | null }[]> {
		return asArray(await this.session.api(`${this.apiPath}/contents/${dir}`))
			.map(asRecord)
			.filter((e) => typeof e.name === 'string')
			.map((e) => ({ name: String(e.name), type: String(e.type), sha: typeof e.sha === 'string' ? e.sha : null }));
	}

	/** Newest first. `at` is a branch or commit. */
	async commits(path: string, { at, limit = 100 }: { at?: string; limit?: number } = {}): Promise<Record<string, unknown>[]> {
		const on = at === undefined ? '' : `&sha=${encodeURIComponent(at)}`;
		return asArray(await this.session.api(`${this.apiPath}/commits?path=${encodeURIComponent(path)}${on}&per_page=${limit}`)).map(asRecord);
	}

	async defaultBranch(): Promise<string> {
		const repo = asRecord(await this.session.api(this.apiPath));
		if (typeof repo.default_branch !== 'string') throw new Error(`${HOST} did not say which branch is ${this.ref.repo}’s default.`);
		return repo.default_branch;
	}

	async readFile(path: string): Promise<string | null> {
		return (await this.readBytes(path))?.toString('utf8') ?? null;
	}

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

	private async shaAt(path: string): Promise<string | null> {
		try {
			const file = asRecord(await this.session.api(`${this.apiPath}/contents/${path}`));
			return typeof file.sha === 'string' ? file.sha : null;
		} catch (err) {
			if (hostErrorKind(err) === 'notFound') return null;
			throw err;
		}
	}

	async hasFile(path: string): Promise<boolean> {
		return (await this.shaAt(path)) !== null;
	}

	/** If the file is no longer blob `sha`, the host refuses it as a conflict. */
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

	/** Used only where there is no clone on this machine to write into, so there is one writer per machine. */
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
