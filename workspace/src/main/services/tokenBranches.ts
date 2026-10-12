/**
 * Where a change to the library's tokens is kept, and how it is proposed (T4 and T5 of the design system plan).
 *
 * **Saving** writes the change as one commit on a branch of the library that DSNR makes for it (`dsnr/tokens-…`), and on
 * no other. The commit is made by git's own plumbing: the edited files are written as objects, put into a tree made from
 * the commit the change was made on, and committed with the last save as its parent. **Nothing is checked out**, so the
 * person's checkout, its index and its files are never touched, and no working copy is needed. Each save holds the whole
 * change, so a token reset since the last save is back as the library has it; a save that changes nothing makes no commit.
 * The branch only moves from where DSNR left it, so work someone else put on it is never lost. The files come from the
 * same writer the previews are tried with (`editedFiles`), read back and checked before anything is written.
 *
 * **Proposing** pushes the branch and opens a **draft** pull request through the tools Share uses (the person's own git
 * and GitHub command line), and finds Chromatic's build among the pull request's checks once the library's CI has made
 * one. A save after that is pushed, so the pull request always has the last save.
 *
 * Which branch a design system's change is on is remembered on disk, so the app can be closed and the change carried on.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { ConnectedDesignSystem, TokenBranch, TokenEdit } from '../../shared/contract';
import { describeChange } from '../../shared/tokens';
import { libraryCommit, systemReads } from './designLibrary';
import { dsnrBranchPattern, newDsnrBranch } from './dsnrBranch';
import { readTokens } from './designTokens';
import { branchExists, commitOnto, git } from './git';
import type { CatalogReads } from './componentCatalog';
import type { ShareTools } from './share';
import { editedFiles } from './tokenEdits';

/** The branches DSNR saves a change to: its own, so a save can never land on anyone's work. */
export const TOKEN_BRANCH = dsnrBranchPattern('tokens');

/**
 * What DSNR keeps of a branch beyond what is shown: the library's commit the change is made on (`base`), and the commit
 * the branch was last saved at (`tip`), to move it only from there.
 */
type Kept = TokenBranch & { base: string; tip: string };

/** A commit of `base`'s tree with `files` (path to text) as given, whose parent is `parent`; null when nothing would change. */
export const commitFiles = async (
	root: string,
	base: string,
	parent: string,
	files: Map<string, string>,
	message: string,
): Promise<string | null> => {
	const blobs = new Map<string, string>();
	for (const [path, text] of files) blobs.set(path, await git(root, ['hash-object', '-w', '--stdin'], { input: text }));
	return commitOnto(root, base, parent, blobs, message);
};

/** What a save's commit says: how many tokens it changes, and each, in the panel's words. */
export const commitMessage = (lines: string[]): string =>
	[`Design tokens: ${lines.length === 0 ? 'back as the library has them' : `${lines.length} changed`}`, '', ...lines, '', 'Saved from DSNR.'].join(
		'\n',
	);

/** What a pull request for a change says: the tokens it changes, and that it was opened from DSNR, as a draft. */
export const proposalText = (lines: string[]): { title: string; body: string } => ({
	title: `Design tokens: ${lines[0]?.split(':')[0] ?? 'a change'}${lines.length > 1 ? ` and ${lines.length - 1} more` : ''}`,
	body: [
		'A change to the design tokens, made and tried in DSNR.',
		'',
		...lines.map((l) => `- ${l}`),
		'',
		'Each commit is one save, so the history is the iterations. Chromatic’s build shows every component with the change.',
		'',
		'_Opened by DSNR as a draft._',
	].join('\n'),
});

export interface TokenBranchesDeps {
	/** The design system shown, or null when none is connected or its clone is gone. */
	system: () => ConnectedDesignSystem | null;
	/** Where which branch each design system's change is on is kept. */
	file: string;
	/** The person's own git and GitHub command line, in a clone: the tools Share uses. */
	tools: (root: string) => ShareTools;
	now?: () => Date;
}

export class TokenBranches {
	constructor(private readonly deps: TokenBranchesDeps) {}

	/** The shown design system's branch, or null: none was saved, or the branch is gone from the clone. */
	async current(): Promise<TokenBranch | null> {
		const at = await this.kept();
		if (at === null) return null;
		const { system, kept } = at;
		// Chromatic's link comes after the pull request does, when the library's CI has built it.
		if (kept.pullRequest && kept.pullRequest.chromatic === null) {
			const checks = await this.deps
				.tools(system.root)
				.checks(kept.pullRequest.number)
				.catch(() => []);
			const chromatic = checks.find((c) => /chromatic/i.test(`${c.name} ${c.link}`) && /^https:\/\//.test(c.link))?.link ?? null;
			if (chromatic) this.keep(system.id, { ...kept, pullRequest: { ...kept.pullRequest, chromatic } });
			return shown({ ...kept, pullRequest: { ...kept.pullRequest, chromatic } });
		}
		return shown(kept);
	}

	/** Saves `edits` as one commit on the branch, made from the library's current commit on the first save. */
	async save(edits: TokenEdit[]): Promise<TokenBranch> {
		const system = this.system();
		const kept = (await this.kept())?.kept ?? null;
		const base = kept?.base ?? (await libraryCommit(system.root, system.branch));
		if (base === null) throw new Error(`The library has no ${system.branch} branch from GitHub to make a change on.`);
		if (kept === null && edits.length === 0) throw new Error('There is no change to save.');

		const reads = await systemReads(system, base);
		const files = await editedFiles(reads, edits);
		const message = commitMessage(await describedAt(reads, edits));

		const branch = kept?.branch ?? newDsnrBranch('tokens', this.deps.now?.() ?? new Date());
		const parent = kept?.tip ?? base;
		const commit = await commitFiles(system.root, base, parent, files, message);
		// The same files as the last save: no commit, but the change as asked is the one saved.
		if (commit === null && kept !== null) {
			this.keep(system.id, { ...kept, saved: edits });
			return shown({ ...kept, saved: edits });
		}
		if (commit === null) throw new Error('This change leaves the library as it is, so there is nothing to save.');
		// From where DSNR left it, or for a new branch only if there is none of that name: never over a commit it did not make.
		await git(system.root, ['update-ref', '-m', 'DSNR: save design tokens', `refs/heads/${branch}`, commit, kept?.tip ?? '']).catch((err: Error) => {
			throw new Error(`${branch} has moved since DSNR last saved to it, so nothing was saved. ${err.message}`);
		});
		const next: Kept = { ...(kept ?? this.fresh(branch, base)), tip: commit, saved: edits, saves: (kept?.saves ?? 0) + 1 };
		this.keep(system.id, next);
		// Once proposed, the pull request has every save.
		if (next.pullRequest) await this.deps.tools(system.root).push(branch);
		return shown(next);
	}

	/** Pushes the branch and opens a draft pull request for it; the one open already, if there is one. */
	async propose(): Promise<TokenBranch> {
		const at = await this.kept();
		if (at === null) throw new Error('Save the change to a branch first; then it can be proposed.');
		const { system, kept } = at;
		const tools = this.deps.tools(system.root);
		await tools.push(kept.branch);
		const open = await tools.findPr(kept.branch);
		const { title, body } = proposalText(await describedAt(await systemReads(system, kept.base), kept.saved));
		const pr = open ?? (await tools.createDraftPr(kept.branch, title, body));
		const next: Kept = { ...kept, pullRequest: { number: pr.number, url: pr.url, chromatic: kept.pullRequest?.chromatic ?? null } };
		this.keep(system.id, next);
		return shown(next);
	}

	/** Forgets the shown design system's branch, so the next save makes a new one. The branch and its pull request stay. */
	forget(): void {
		const system = this.deps.system();
		if (system) this.write(Object.fromEntries(Object.entries(this.read()).filter(([id]) => id !== system.id)));
	}

	private system(): ConnectedDesignSystem {
		const system = this.deps.system();
		if (system === null) throw new Error('There is no design system connected.');
		return system;
	}

	private fresh(branch: string, base: string): Kept {
		return { branch, base, tip: base, saved: [], saves: 0, pullRequest: null };
	}

	/** The shown design system's branch as kept, when it is still in the clone where DSNR left it. */
	private async kept(): Promise<{ system: ConnectedDesignSystem; kept: Kept } | null> {
		const system = this.deps.system();
		const kept = system ? this.read()[system.id] : undefined;
		if (!system || !kept) return null;
		const there = await branchExists(system.root, kept.branch).catch(() => false);
		if (!there) {
			this.forget();
			return null;
		}
		return { system, kept };
	}

	private read(): Record<string, Kept> {
		try {
			const all = JSON.parse(readFileSync(this.deps.file, 'utf8')) as Record<string, Kept>;
			// Only a branch DSNR names as its own is ever written to, whatever the file says.
			return Object.fromEntries(
				Object.entries(all).filter(([, k]) => typeof k?.branch === 'string' && TOKEN_BRANCH.test(k.branch) && typeof k.tip === 'string'),
			);
		} catch {
			return {};
		}
	}

	private keep(id: string, kept: Kept): void {
		this.write({ ...this.read(), [id]: kept });
	}

	private write(all: Record<string, Kept>): void {
		mkdirSync(dirname(this.deps.file), { recursive: true });
		writeFileSync(this.deps.file, JSON.stringify(all));
	}
}

/** A branch as the window sees it: without the commits DSNR keeps to make its saves from. */
const shown = ({ tip: _tip, base: _base, ...branch }: Kept): TokenBranch => branch;

/** A change in words, against the tokens as the library has them at a commit. */
const describedAt = async (reads: CatalogReads, edits: TokenEdit[]): Promise<string[]> => describeChange((await readTokens(reads)).tokens, edits);
