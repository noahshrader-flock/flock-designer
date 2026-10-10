/**
 * The company's voice and tone (T9 of the design system plan): one file in the design repository, read and changed from the
 * Design System tab, and put into every agent task (`voiceBrief.ts`).
 *
 * **Reading** is from the default branch, which GitHub is asked for rather than named (the design repository's is not
 * `main`), so a commit made in the repository shows the next time the tab reads.
 *
 * **Saving** keeps the text on a branch DSNR makes for it (`dsnr/voice-…`), made from the default branch's head on the
 * first save, with one commit for each save after; nothing is checked out and the default branch is never written. A save
 * is refused when the file on the default branch is no longer the one the text was opened at, so nobody's change is
 * overwritten. The branch and its commits are made through the app's own session, as the records are published.
 *
 * **Proposing** opens a draft pull request with the person's own GitHub command line, as Share does, so the app's GitHub
 * App needs no permission for pull requests. A change merged, closed or deleted on GitHub is forgotten when it is next read.
 *
 * Every call here was tried on the real design repository on 2026-10-10 before this was written.
 */
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { VoiceAndTone, VoiceBranch, VoiceSave } from '../../shared/contract';
import { asArray, asRecord } from '../../shared/json';
import type { DesignRepoRef, GitHubApi } from './designRepo';

/** Where the file is, in the design repository: the shared layer's Flock tier (decided in the plan, T9). */
export const VOICE_FILE = 'standards/flock/voice-and-tone.md';

/** The branches DSNR saves the voice and tone to: its own, so a save can never land on anyone's work. */
export const VOICE_BRANCH = /^dsnr\/voice-\d{8}-[0-9a-f]{4}$/;

/** A new branch's name: the day, and four letters so two on one day differ. */
const newBranch = (now: Date): string => `dsnr/voice-${now.toISOString().slice(0, 10).replace(/-/g, '')}-${randomBytes(2).toString('hex')}`;

/** What is kept of the change between runs of the app, by repository. */
interface Kept {
	branch: string;
	saves: number;
	pullRequest: { number: number; url: string } | null;
}

/** GitHub's status for a failed call, from the app's session and the command line alike. */
const statusOf = (err: unknown): number | undefined => {
	const s = (err as { status?: unknown } | null)?.status;
	return typeof s === 'number' ? s : undefined;
};

const PROPOSAL_TITLE = 'Voice and tone';
const PROPOSAL_BODY =
	'Proposed from the Voice and tone tab in DSNR.\n\nOnce merged, this is the voice and tone every agent task carries, wherever the product’s own guidance does not say otherwise.';

export class VoiceAndToneFile {
	private readonly repo: DesignRepoRef;
	private readonly app: GitHubApi;
	private readonly person: GitHubApi | null;
	private readonly file: string;
	private readonly now: () => Date;

	constructor({
		repo,
		app,
		person,
		file,
		now = () => new Date(),
	}: {
		repo: DesignRepoRef;
		/** The app's own session: what reads the file and writes the branch. */
		app: GitHubApi;
		/** The person's GitHub command line, which opens the pull request; null where there is none. */
		person: GitHubApi | null;
		/** Where the branch is remembered. */
		file: string;
		now?: () => Date;
	}) {
		this.repo = repo;
		this.app = app;
		this.person = person;
		this.file = file;
		this.now = now;
	}

	private get base(): string {
		return `/repos/${this.repo.owner}/${this.repo.repo}`;
	}
	private get key(): string {
		return `${this.repo.owner}/${this.repo.repo}`;
	}

	/** The change kept, if one is: an entry naming a branch DSNR did not make is never taken for one. */
	private kept(): Kept | null {
		if (!existsSync(this.file)) return null;
		try {
			const entry = asRecord(asRecord(JSON.parse(readFileSync(this.file, 'utf8')))[this.key]);
			if (typeof entry.branch !== 'string' || !VOICE_BRANCH.test(entry.branch)) return null;
			const pr = asRecord(entry.pullRequest);
			return {
				branch: entry.branch,
				saves: typeof entry.saves === 'number' ? entry.saves : 0,
				pullRequest: typeof pr.number === 'number' && typeof pr.url === 'string' ? { number: pr.number, url: pr.url } : null,
			};
		} catch {
			return null;
		}
	}
	private keep(kept: Kept | null): void {
		let all: Record<string, unknown> = {};
		try {
			all = existsSync(this.file) ? asRecord(JSON.parse(readFileSync(this.file, 'utf8'))) : {};
		} catch {
			all = {};
		}
		if (kept) all[this.key] = kept;
		else delete all[this.key];
		mkdirSync(dirname(this.file), { recursive: true });
		writeFileSync(this.file, JSON.stringify(all, null, 2));
	}

	/** Forgets the change, to start again from the default branch's file. The branch and any pull request stay on GitHub. */
	forget(): void {
		this.keep(null);
	}

	private async defaultBranch(): Promise<string> {
		const repo = asRecord(await this.app.api(this.base));
		if (typeof repo.default_branch !== 'string') throw new Error('GitHub did not say which branch is the design repository’s default.');
		return repo.default_branch;
	}

	/** The file on a branch, with its blob's sha; null when the branch or the file is not there. Any other failure is said. */
	private async read(ref: string): Promise<{ text: string; sha: string } | null> {
		try {
			const file = asRecord(await this.app.api(`${this.base}/contents/${VOICE_FILE}?ref=${encodeURIComponent(ref)}`));
			if (typeof file.sha !== 'string') return null;
			// Over 1 MB, the contents API leaves the content out; the blob it names carries it.
			const content =
				file.encoding === 'none' ? asRecord(await this.app.api(`${this.base}/git/blobs/${file.sha}`)).content : file.content;
			return typeof content === 'string' ? { text: Buffer.from(content, 'base64').toString('utf8'), sha: file.sha } : null;
		} catch (err) {
			if (statusOf(err) === 404) return null;
			throw err;
		}
	}

	private async branchExists(branch: string): Promise<boolean> {
		try {
			await this.app.api(`${this.base}/git/ref/heads/${encodeURIComponent(branch)}`);
			return true;
		} catch (err) {
			if (statusOf(err) === 404) return false;
			throw err;
		}
	}

	/** Asked of the person's command line where there is one, else of the app's session, which may not see pull requests. */
	private get pulls(): GitHubApi {
		return this.person ?? this.app;
	}

	/**
	 * The pull request a kept branch is in, as GitHub has it now: `gone` once it is merged or closed. Null when there is none
	 * open; undefined when GitHub could not tell, in which case what was kept stands.
	 */
	private async pullRequestOf(kept: Kept): Promise<{ number: number; url: string } | 'gone' | null | undefined> {
		try {
			if (kept.pullRequest) {
				const pr = asRecord(await this.pulls.api(`${this.base}/pulls/${kept.pullRequest.number}`));
				return pr.state === 'open' && !pr.merged_at ? kept.pullRequest : 'gone';
			}
			const found = asArray(await this.pulls.api(`${this.base}/pulls?head=${encodeURIComponent(`${this.repo.owner}:${kept.branch}`)}&state=all`)).map(asRecord);
			const open = found.find((p) => p.state === 'open');
			if (open && typeof open.number === 'number' && typeof open.html_url === 'string') return { number: open.number, url: open.html_url };
			return found.length > 0 ? 'gone' : null;
		} catch {
			return undefined;
		}
	}

	private compare(base: string, branch: string): string {
		return `https://github.com/${this.key}/compare/${encodeURIComponent(base)}...${encodeURIComponent(branch)}?expand=1`;
	}

	/** The file as the default branch has it now, and the change kept on a branch, if one still is. */
	async current(): Promise<VoiceAndTone> {
		const base = await this.defaultBranch();
		const onDefault = await this.read(base);
		return { path: VOICE_FILE, base, text: onDefault?.text ?? null, sha: onDefault?.sha ?? null, branch: await this.branch(base) };
	}

	/** The kept branch as GitHub has it, after forgetting it if it was merged, closed or deleted there. */
	private async branch(base: string): Promise<VoiceBranch | null> {
		let kept = this.kept();
		if (kept === null) return null;
		const onBranch = (await this.branchExists(kept.branch)) ? await this.read(kept.branch) : null;
		const pullRequest = onBranch === null ? 'gone' : await this.pullRequestOf(kept);
		if (pullRequest === 'gone') {
			this.forget();
			return null;
		}
		if (pullRequest !== undefined && pullRequest?.number !== kept.pullRequest?.number) {
			kept = { ...kept, pullRequest };
			this.keep(kept);
		}
		return { branch: kept.branch, text: onBranch!.text, saves: kept.saves, pullRequest: kept.pullRequest, compare: this.compare(base, kept.branch) };
	}

	/**
	 * Saves `text` as one commit on the kept branch, made first when there is none. `against` is the sha of the default
	 * branch's file the text was opened at (null: there was no file); a file there that is not that one refuses the save.
	 */
	async save(text: string, against: string | null): Promise<VoiceSave> {
		const base = await this.defaultBranch();
		const onDefault = await this.read(base);
		if ((onDefault?.sha ?? null) !== against) return { state: 'changed', voice: await this.current() };
		const kept = this.kept();
		try {
			if (kept && (await this.branchExists(kept.branch))) {
				const onBranch = await this.read(kept.branch);
				if (onBranch?.text !== text) {
					await this.put(kept.branch, text, onBranch?.sha ?? null, 'Voice and tone, saved from DSNR');
					this.keep({ ...kept, saves: kept.saves + 1 });
				}
			} else {
				if (onDefault?.text === text) return { state: 'saved', voice: await this.current() };
				const branch = newBranch(this.now());
				const head = asRecord(asRecord(await this.app.api(`${this.base}/git/ref/heads/${encodeURIComponent(base)}`)).object).sha;
				if (typeof head !== 'string') throw new Error(`GitHub did not say where ${base} is.`);
				await this.app.api(`${this.base}/git/refs`, { method: 'POST', body: { ref: `refs/heads/${branch}`, sha: head } });
				try {
					await this.put(branch, text, against, onDefault ? 'Voice and tone, saved from DSNR' : 'Voice and tone, started from DSNR');
				} catch (err) {
					// The default branch moved between reading it and making the branch: the branch goes, and the save is refused.
					await this.app.api(`${this.base}/git/refs/heads/${encodeURIComponent(branch)}`, { method: 'DELETE' }).catch(() => undefined);
					if (statusOf(err) === 409 || statusOf(err) === 422) return { state: 'changed', voice: await this.current() };
					throw err;
				}
				this.keep({ branch, saves: 1, pullRequest: null });
			}
		} catch (err) {
			const s = statusOf(err);
			if (s === 403 || s === 404) throw new Error('Saving needs write access to the design repository. Ask someone who has it to add you.');
			throw err;
		}
		return { state: 'saved', voice: await this.current() };
	}

	/** One commit of the file on one of DSNR's own branches, never on any other. */
	private async put(branch: string, text: string, sha: string | null, message: string): Promise<void> {
		if (!VOICE_BRANCH.test(branch)) throw new Error(`${branch} is not a branch DSNR made, so nothing is written to it.`);
		await this.app.api(`${this.base}/contents/${VOICE_FILE}`, {
			method: 'PUT',
			body: { message, branch, content: Buffer.from(text, 'utf8').toString('base64'), ...(sha ? { sha } : {}) },
		});
	}

	/** Opens a draft pull request for the kept branch, or finds the one open for it already. */
	async propose(): Promise<VoiceAndTone> {
		const kept = this.kept();
		if (kept === null) throw new Error('Save the change before proposing it.');
		if (this.person === null) throw new Error(needsGh);
		const base = await this.defaultBranch();
		try {
			const open = asArray(await this.person.api(`${this.base}/pulls?head=${encodeURIComponent(`${this.repo.owner}:${kept.branch}`)}&state=open`)).map(asRecord)[0];
			const pr =
				open ??
				asRecord(
					await this.person.api(`${this.base}/pulls`, {
						method: 'POST',
						body: { title: PROPOSAL_TITLE, head: kept.branch, base, body: PROPOSAL_BODY, draft: true },
					}),
				);
			if (typeof pr.number !== 'number' || typeof pr.html_url !== 'string') throw new Error('GitHub did not say which pull request it opened.');
			this.keep({ ...kept, pullRequest: { number: pr.number, url: pr.html_url } });
		} catch (err) {
			// No command line, or one not signed in: the change stays saved, and GitHub's own page can open the pull request.
			if (statusOf(err) === undefined && /ENOENT|not found|auth|log ?in/i.test(String((err as Error).message))) throw new Error(needsGh);
			throw err;
		}
		return this.current();
	}
}

const needsGh =
	'Proposing opens the pull request with the GitHub command line (gh), which is not installed or not signed in here. The change is saved on its branch: open the pull request on GitHub instead.';
