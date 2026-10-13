import { type RepoRef, formatRepo } from '../../shared/repoRef';
import { compareUrl } from '../../shared/hostUrls';
import { needsCli } from '../../shared/vocabulary';
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
import { asRecord } from '../../shared/json';
import type { GitHubApi } from '../../host/designRepo';
import { RepoFiles } from '../../host/repoFiles';
import { ChangeRequests } from '../../host/changeRequests';
import { designSystemId } from './designSystems';
import { dsnrBranchPattern, newDsnrBranch } from './dsnrBranch';
import { hostErrorKind } from '../../host/hostError';
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
	private readonly files: RepoFiles;
	private readonly requests: ChangeRequests;
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
		this.files = new RepoFiles(github, repo);
		this.requests = new ChangeRequests(github, repo);
		this.file = jsonFile(file, { parse: asRecord, fallback: {} });
		this.now = now;
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
			if (kept.pullRequest) return (await this.requests.isOpen(kept.pullRequest.number)) ? kept.pullRequest : 'gone';
			return (await this.requests.findOpen(kept.branch)) ?? ((await this.requests.anyFrom(kept.branch)) ? 'gone' : null);
		} catch {
			return undefined;
		}
	}

	/** The file as the default branch has it now, and the change kept on a branch, if one still is. */
	async current(): Promise<VoiceAndTone> {
		const base = await this.files.defaultBranch();
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
		return {
			branch: kept.branch,
			text: onBranch!.text,
			saves: kept.saves,
			pullRequest: kept.pullRequest,
			compare: compareUrl(formatRepo(this.repo), base, kept.branch),
		};
	}

	/**
	 * Saves `text` as one commit on the kept branch, made first when there is none. `against` is the sha of the default
	 * branch's file the text was opened at (null: there was no file); a file there that is not that one refuses the save.
	 */
	async save(text: string, against: string | null): Promise<VoiceSave> {
		const base = await this.files.defaultBranch();
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
				await this.files.createBranch(branch, await this.files.branchHead(base));
				try {
					await this.put(branch, text, against, onDefault ? 'Voice and tone, saved from DSNR' : 'Voice and tone, started from DSNR');
				} catch (err) {
					// The default branch moved between reading it and making the branch: the branch goes, and the save is refused.
					await this.files.deleteBranch(branch).catch(() => undefined);
					if (hostErrorKind(err) === 'conflict') return { state: 'changed', voice: await this.current() };
					throw err;
				}
				this.keep({ branch, saves: 1, pullRequest: null });
			}
		} catch (err) {
			const kind = hostErrorKind(err);
			if (kind === 'forbidden' || kind === 'notFound')
				throw new Error('Saving needs write access to the design repository. Ask someone who has it to add you.');
			throw err;
		}
		return { state: 'saved', voice: await this.current() };
	}

	/** One commit of the file on one of DSNR's own branches, never on any other. */
	private async put(branch: string, text: string, sha: string | null, message: string): Promise<void> {
		if (!VOICE_BRANCH.test(branch)) throw new Error(`${branch} is not a branch DSNR made, so nothing is written to it.`);
		await this.files.putFile(this.path, text, message, { branch, sha });
	}

	/** Opens a draft pull request for the kept branch, or finds the one open for it already. */
	async propose(): Promise<VoiceAndTone> {
		const kept = this.kept();
		if (kept === null) throw new Error('Save the change before proposing it.');
		const base = await this.files.defaultBranch();
		try {
			const pr =
				(await this.requests.findOpen(kept.branch)) ??
				(await this.requests.openDraft({ head: kept.branch, base, title: PROPOSAL_TITLE, body: PROPOSAL_BODY }));
			this.keep({ ...kept, pullRequest: pr });
		} catch (err) {
			// A command line not signed in, or gone since: the change stays saved, and GitHub's own page can open the pull request.
			if (hostErrorKind(err) === 'missingCli' || hostErrorKind(err) === 'reauth') throw new Error(NEEDS_GH);
			throw err;
		}
		return this.current();
	}
}

/** What is said when the person's command line for the host cannot be used: everything here goes through it. */
export const NEEDS_GH = needsCli('Reading and saving the voice and tone', 'Anything already saved is on its branch.');
