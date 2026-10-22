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

	/**
	 * One commit on the default branch with `path` gone, a file or every file in a folder, not one per file, so no one ever
	 * reads half of it.
	 * Moved on meanwhile (a teammate's save), it is made again on what is there now, once.
	 */
	async removePath(path: string, message: string): Promise<void> {
		const remove = async () => {
			const branch = (await this.defaultBranch()).split('/').map(encodeURIComponent).join('/');
			const head = String(asRecord(asRecord(await this.session.api(`${this.apiPath}/git/ref/heads/${branch}`)).object).sha);
			const base = String(asRecord(asRecord(await this.session.api(`${this.apiPath}/git/commits/${head}`)).tree).sha);
			const tree = asRecord(await this.session.api(`${this.apiPath}/git/trees/${base}?recursive=1`));
			if (tree.truncated === true) throw new Error(`${HOST} would not list all of ${this.ref.repo}, so ${path} was not deleted.`);
			const gone = asArray(tree.tree)
				.map(asRecord)
				.filter((e) => e.type === 'blob' && (String(e.path) === path || String(e.path).startsWith(`${path}/`)))
				.map((e) => ({ path: String(e.path), mode: String(e.mode), type: 'blob', sha: null }));
			if (gone.length === 0) return;
			const made = asRecord(await this.session.api(`${this.apiPath}/git/trees`, { method: 'POST', body: { base_tree: base, tree: gone } }));
			const commit = asRecord(
				await this.session.api(`${this.apiPath}/git/commits`, { method: 'POST', body: { message, tree: made.sha, parents: [head] } }),
			);
			await this.session.api(`${this.apiPath}/git/refs/heads/${branch}`, { method: 'PATCH', body: { sha: commit.sha, force: false } });
		};
		try {
			await remove();
		} catch (err) {
			if (hostErrorKind(err) === 'conflict') return remove();
			if (hostErrorKind(err) === 'forbidden' || hostErrorKind(err) === 'notFound') throw noWriteAccess(this.ref);
			throw err;
		}
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
