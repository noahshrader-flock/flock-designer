import { type RepoRef, formatRepo } from '../../shared/repoRef';
/**
 * The company's voice and tone (T9 of the design system plan): one file in the design system's agent files
 * (`.dsnr/voice-and-tone.md`, in its folder when it lives in a larger repository), read and changed from the Design System
 * tab, and put into every agent task (`voiceBrief.ts`).
 *
 * **Reading** is from the design system's default branch, which GitHub is asked for rather than named, so a commit made in
 * the repository shows the next time the tab reads.
 *
 * **Saving** keeps the text on a branch DSNR makes for it (`dsnr/voice-…`), made from the default branch's head on the
 * first save, with one commit for each save after; nothing is checked out and the default branch is never written. A save
 * is refused when the file on the default branch is no longer the one the text was opened at, so nobody's change is
 * overwritten. **Proposing** opens a draft pull request for it. A change merged, closed or deleted on GitHub is forgotten
 * when it is next read.
 *
 * Every call is the person's own GitHub command line, as a change to the tokens is proposed: the app's own GitHub App is
 * installed on the design repository only, so it cannot reach a design system. Every call was tried on a real repository
 * on 2026-10-10 before this was written.
 */
import type { VoiceAndTone, VoiceBranch, VoiceSave } from '../../shared/contract';
import { asArray, asRecord } from '../../shared/json';
import { DesignRepo, type GitHubApi } from './designRepo';
import { designSystemId } from './designSystems';
import { dsnrBranchPattern, newDsnrBranch } from './dsnrBranch';
import { httpStatus } from './github';
import { type JsonFile, jsonFile } from './jsonFile';

/** Where the file is, in a design system's agent files: how Flock speaks is the design system's (Noah, 2026-10-10). */
export const VOICE_FILE = '.dsnr/voice-and-tone.md';

/** The branches DSNR saves the voice and tone to: its own, so a save can never land on anyone's work. */
export const VOICE_BRANCH = dsnrBranchPattern('voice');

/** What is kept of the change between runs of the app, by repository. */
interface Kept {
	branch: string;
	saves: number;
	pullRequest: { number: number; url: string } | null;
}

const PROPOSAL_TITLE = 'Voice and tone';
const PROPOSAL_BODY =
	'Proposed from the Voice and Tone tab in DSNR.\n\nOnce merged, this is the voice and tone every agent task carries, wherever a product’s own conventions do not say otherwise.';

export class VoiceAndToneFile {
	private readonly repo: RepoRef;
	/** The file's path in the repository: in the design system's folder, when it has one. */
	private readonly path: string;
	/** The design system's folder in the repository, empty when it is the whole repository. */
	private readonly folder: string;
	/** The file, read as every file DSNR reads from GitHub is. */
	private readonly files: DesignRepo;
	private readonly github: GitHubApi;
	/** The change kept for each design system, by its id. */
	private readonly file: JsonFile<Record<string, unknown>>;
	private readonly now: () => Date;

	constructor({
		repo,
		folder = '',
		github,
		file,
		now = () => new Date(),
	}: {
		/** The design system's repository. */
		repo: RepoRef;
		/** Its folder, when it lives in a larger repository; empty when it is the whole repository. */
		folder?: string;
		/** The person's own GitHub command line. */
		github: GitHubApi;
		/** Where the branch is remembered. */
		file: string;
		now?: () => Date;
	}) {
		this.repo = repo;
		this.folder = folder.replace(/\/+$/, '');
		this.path = this.folder ? `${this.folder}/${VOICE_FILE}` : VOICE_FILE;
		this.files = new DesignRepo(github, repo);
		this.github = github;
		this.file = jsonFile(file, { parse: asRecord, fallback: {} });
		this.now = now;
	}

	private get base(): string {
		return `/repos/${this.repo.owner}/${this.repo.repo}`;
	}
	/**
	 * Kept by the design system's id, as the token branches are, so two design systems in one repository keep their changes
	 * apart. For one that is the whole repository the id is the repository's name, the key this file has always used.
	 */
	private get key(): string {
		return designSystemId(formatRepo(this.repo), this.folder);
	}

	/** The change kept, if one is: an entry naming a branch DSNR did not make is never taken for one. */
	private kept(): Kept | null {
		const entry = asRecord(this.file.read()[this.key]);
		if (typeof entry.branch !== 'string' || !VOICE_BRANCH.test(entry.branch)) return null;
		const pr = asRecord(entry.pullRequest);
		return {
			branch: entry.branch,
			saves: typeof entry.saves === 'number' ? entry.saves : 0,
			pullRequest: typeof pr.number === 'number' && typeof pr.url === 'string' ? { number: pr.number, url: pr.url } : null,
		};
	}
	private keep(kept: Kept | null): void {
		this.file.update((all) => {
			const { [this.key]: _, ...others } = all;
			return kept ? { ...others, [this.key]: kept } : others;
		});
	}

	/** Forgets the change, to start again from the default branch's file. The branch and any pull request stay on GitHub. */
	forget(): void {
		this.keep(null);
	}

	private async defaultBranch(): Promise<string> {
		const repo = asRecord(await this.github.api(this.base));
		if (typeof repo.default_branch !== 'string') throw new Error('GitHub did not say which branch is the design repository’s default.');
		return repo.default_branch;
	}

	/**
	 * The file on a branch, with its blob's sha; null when the branch or the file is not there, which for a branch of DSNR's
	 * (always made with the file on it) is the branch deleted. Any other failure is said.
	 */
	private read(ref: string): Promise<{ text: string; sha: string } | null> {
		return this.files.readFileAt(this.path, ref);
	}

	/**
	 * The pull request a kept branch is in, as GitHub has it now: `gone` once it is merged or closed. Null when there is none
	 * open; undefined when GitHub could not tell, in which case what was kept stands.
	 */
	private async pullRequestOf(kept: Kept): Promise<{ number: number; url: string } | 'gone' | null | undefined> {
		try {
			if (kept.pullRequest) {
				const pr = asRecord(await this.github.api(`${this.base}/pulls/${kept.pullRequest.number}`));
				return pr.state === 'open' && !pr.merged_at ? kept.pullRequest : 'gone';
			}
			const found = asArray(
				await this.github.api(`${this.base}/pulls?head=${encodeURIComponent(`${this.repo.owner}:${kept.branch}`)}&state=all`),
			).map(asRecord);
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
		return {
			repository: this.key,
			path: this.path,
			base,
			text: onDefault?.text ?? null,
			sha: onDefault?.sha ?? null,
			branch: await this.branch(base),
		};
	}

	/** The kept branch as GitHub has it, after forgetting it if it was merged, closed or deleted there. */
	private async branch(base: string): Promise<VoiceBranch | null> {
		let kept = this.kept();
		if (kept === null) return null;
		const onBranch = await this.read(kept.branch);
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
			const onBranch = kept && (await this.read(kept.branch));
			if (kept && onBranch) {
				if (onBranch.text !== text) {
					await this.put(kept.branch, text, onBranch.sha, 'Voice and tone, saved from DSNR');
					this.keep({ ...kept, saves: kept.saves + 1 });
				}
			} else {
				if (onDefault?.text === text) return { state: 'saved', voice: await this.current() };
				const branch = newDsnrBranch('voice', this.now());
				const head = asRecord(asRecord(await this.github.api(`${this.base}/git/ref/heads/${encodeURIComponent(base)}`)).object).sha;
				if (typeof head !== 'string') throw new Error(`GitHub did not say where ${base} is.`);
				await this.github.api(`${this.base}/git/refs`, { method: 'POST', body: { ref: `refs/heads/${branch}`, sha: head } });
				try {
					await this.put(branch, text, against, onDefault ? 'Voice and tone, saved from DSNR' : 'Voice and tone, started from DSNR');
				} catch (err) {
					// The default branch moved between reading it and making the branch: the branch goes, and the save is refused.
					await this.github.api(`${this.base}/git/refs/heads/${encodeURIComponent(branch)}`, { method: 'DELETE' }).catch(() => undefined);
					if (httpStatus(err) === 409 || httpStatus(err) === 422) return { state: 'changed', voice: await this.current() };
					throw err;
				}
				this.keep({ branch, saves: 1, pullRequest: null });
			}
		} catch (err) {
			const s = httpStatus(err);
			if (s === 403 || s === 404) throw new Error('Saving needs write access to the design repository. Ask someone who has it to add you.');
			throw err;
		}
		return { state: 'saved', voice: await this.current() };
	}

	/** One commit of the file on one of DSNR's own branches, never on any other. */
	private async put(branch: string, text: string, sha: string | null, message: string): Promise<void> {
		if (!VOICE_BRANCH.test(branch)) throw new Error(`${branch} is not a branch DSNR made, so nothing is written to it.`);
		await this.github.api(`${this.base}/contents/${this.path}`, {
			method: 'PUT',
			body: { message, branch, content: Buffer.from(text, 'utf8').toString('base64'), ...(sha ? { sha } : {}) },
		});
	}

	/** Opens a draft pull request for the kept branch, or finds the one open for it already. */
	async propose(): Promise<VoiceAndTone> {
		const kept = this.kept();
		if (kept === null) throw new Error('Save the change before proposing it.');
		const base = await this.defaultBranch();
		try {
			const open = asArray(
				await this.github.api(`${this.base}/pulls?head=${encodeURIComponent(`${this.repo.owner}:${kept.branch}`)}&state=open`),
			).map(asRecord)[0];
			const pr =
				open ??
				asRecord(
					await this.github.api(`${this.base}/pulls`, {
						method: 'POST',
						body: { title: PROPOSAL_TITLE, head: kept.branch, base, body: PROPOSAL_BODY, draft: true },
					}),
				);
			if (typeof pr.number !== 'number' || typeof pr.html_url !== 'string') throw new Error('GitHub did not say which pull request it opened.');
			this.keep({ ...kept, pullRequest: { number: pr.number, url: pr.html_url } });
		} catch (err) {
			// A command line not signed in, or gone since: the change stays saved, and GitHub's own page can open the pull request.
			if (httpStatus(err) === undefined && /ENOENT|not found|auth|log ?in/i.test(String((err as Error).message))) throw new Error(NEEDS_GH);
			throw err;
		}
		return this.current();
	}
}

/** What is said when the person's GitHub command line cannot be used: everything here goes through it. */
export const NEEDS_GH =
	'The voice and tone is read and saved with the GitHub command line (gh), which is not installed or not signed in here. Install it and run `gh auth login`; anything already saved is on its branch.';
