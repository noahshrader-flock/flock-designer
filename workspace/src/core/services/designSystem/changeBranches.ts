/**
 * Where a change to the library is kept, and how it is proposed: a change to its tokens (T4 and T5 of the design system
 * plan), and the values of a component's own written where they are found (Phase 4 of adjusting a component). One way
 * for both; what differs is what a change writes, and how it is said (`ChangeKind`).
 *
 * **Saving** writes the change as one commit on a branch of the library that DSNR makes for it (`dsnr/<kind>-…`), and on
 * no other. The commit is made by git's own plumbing: the edited files are written as objects, put into a tree made from
 * the commit the change was made on, and committed with the last save as its parent. **Nothing is checked out**, so the
 * person's checkout, its index and its files are never touched, and no working copy is needed. Each save holds the whole
 * change, so a part put back since the last save is back as the library has it; a save that changes nothing makes no
 * commit. The branch only moves from where DSNR left it, so work someone else put on it is never lost.
 *
 * **Proposing** pushes the branch and opens a **draft** pull request through the tools Share uses (the person's own git
 * and GitHub command line), and finds Chromatic's build among the pull request's checks once the library's CI has made
 * one. A save after that is pushed, so the pull request always has the last save.
 *
 * Which branch each change is on is remembered on disk, by the design system and, for a kind kept per component, the
 * component (`scope`), so the app can be closed and the change carried on.
 */
import type { ChangeBranch, ConnectedDesignSystem } from '../../../shared/contract';
import { asRecord } from '../../../shared/json';
import { libraryCommit } from './designLibrary';
import { dsnrBranchPattern, newDsnrBranch } from './dsnrBranch';
import { branchExists, commitOnto, git } from '../platform/git';
import { ScopedRecords } from './scopedRecords';
import type { ShareTools } from '../codebase/share';
import { errorText } from '../../../shared/result';
import { HOST } from '../../../shared/vocabulary';

/** What one kind of change is: what its branches are named, what it writes, and how it is said. */
export interface ChangeKind<C> {
	/** Its branches are `dsnr/<kind>-<day>-<hex>`. */
	kind: string;
	/** A change as the file of kept branches has it, checked as the window's is; throws for anything else. */
	check: (saved: unknown) => C;
	empty: (change: C) => boolean;
	/** The files the change writes, path to text, made from the library at `base`. Throws, in words, for one that cannot be. */
	files: (system: ConnectedDesignSystem, base: string, change: C, scope: string) => Promise<Map<string, string>>;
	/** The change in words, a line for each part, against the library at `base`: what a save's commit says, and its pull request. */
	lines: (system: ConnectedDesignSystem, base: string, change: C, scope: string) => Promise<string[]>;
	/** What its commits and pull requests are titled with (`Design tokens`), and what a save of none of it is. */
	subject: string;
	asItWas: string;
	/** What its pull request says before its lines, and after them. */
	about: string;
	checked: string;
	/** What a save is, as git's reflog says it. */
	saving: string;
}

type Said = Pick<ChangeKind<unknown>, 'subject' | 'asItWas' | 'about' | 'checked'>;

/** What a save's commit says: what it is, a line for each part of it, and that it was saved from DSNR. One way for every kind. */
export const commitText = (of: Said, lines: string[]): string =>
	[`${of.subject}: ${lines.length === 0 ? of.asItWas : `${lines.length} changed`}`, '', ...lines, '', 'Saved from DSNR.'].join('\n');

/** What a change's pull request is titled (by its first part, and how many more) and says, opened by DSNR as a draft. */
export const proposalText = (of: Said, lines: string[]): { title: string; body: string } => ({
	title: `${of.subject}: ${lines[0]?.split(':')[0] ?? of.asItWas}${lines.length > 1 ? ` and ${lines.length - 1} more` : ''}`,
	body: [of.about, '', ...lines.map((l) => `- ${l}`), '', of.checked, '', '_Opened by DSNR as a draft._'].join('\n'),
});

export interface ChangeBranchesDeps {
	/** The design system shown, or null when none is connected or its clone is gone. */
	system: () => ConnectedDesignSystem | null;
	/** Where which branch each change is on is kept. */
	file: string;
	/** The person's own git and GitHub command line, in a clone: the tools Share uses. */
	tools: (root: string) => ShareTools;
	now?: () => Date;
}

/**
 * What DSNR keeps of a branch beyond what is shown: the library's commit the change is made on (`base`), the commit the
 * branch was last saved at (`tip`), to move it only from there, and what that save said (`said`), which its pull request says.
 */
type Kept<C> = ChangeBranch<C> & { base: string; tip: string; said?: string[] };

/** A commit of `base`'s tree with `files` (path to text) as given, whose parent is `parent`; null when nothing would change. */
const commitFiles = async (root: string, base: string, parent: string, files: Map<string, string>, message: string): Promise<string | null> => {
	const blobs = new Map<string, string>();
	for (const [path, text] of files) blobs.set(path, await git(root, ['hash-object', '-w', '--stdin'], { input: text }));
	return commitOnto(root, base, parent, blobs, message);
};

/** A branch as the window sees it: without the commits DSNR keeps to make its saves from. */
const shown = <C>({ tip: _tip, base: _base, said: _said, ...branch }: Kept<C>): ChangeBranch<C> => branch;

export class ChangeBranches<C> {
	/** Each change's branch, by its design system and scope. Only a branch DSNR names as its own is ever written to, whatever the file says. */
	private readonly records: ScopedRecords<Kept<C>>;
	private readonly pattern: RegExp;

	constructor(
		private readonly deps: ChangeBranchesDeps,
		private readonly of: ChangeKind<C>,
	) {
		this.pattern = dsnrBranchPattern(of.kind);
		this.records = new ScopedRecords(deps.system, deps.file, (raw) => this.ownBranches(raw));
	}

	/** The change's branch, or null: none was saved, or the branch is gone from the clone. */
	async current(scope = ''): Promise<ChangeBranch<C> | null> {
		const at = await this.kept(scope);
		if (at === null) return null;
		const { system, kept } = at;
		// Chromatic's link comes after the pull request does, when the library's CI has built it.
		if (kept.pullRequest && kept.pullRequest.chromatic === null) {
			const checks = await this.deps
				.tools(system.root)
				.checks(kept.pullRequest.number)
				.catch(() => []);
			const chromatic = checks.find((c) => /chromatic/i.test(`${c.name} ${c.link}`) && /^https:\/\//.test(c.link))?.link ?? null;
			if (chromatic) this.records.keep(system, scope, { ...kept, pullRequest: { ...kept.pullRequest, chromatic } });
			return shown({ ...kept, pullRequest: { ...kept.pullRequest, chromatic } });
		}
		return shown(kept);
	}

	/**
	 * The scopes that have a branch kept on the design system shown, whose branch is still in its clone (for a component's
	 * values, the story files with a branch of their own); none for a change kept without a scope.
	 */
	async scopes(): Promise<string[]> {
		const scopes = this.records.scopes();
		const there = await Promise.all(scopes.map(async (scope) => (await this.kept(scope)) !== null));
		return scopes.filter((_, i) => there[i]);
	}

	/** Saves `change` as one commit on the branch, made from the library's current commit on the first save. */
	async save(change: C, scope = ''): Promise<ChangeBranch<C>> {
		const system = this.records.system();
		const at = await this.kept(scope);
		const kept = at?.kept ?? null;
		const base = kept?.base ?? (await libraryCommit(system.root, system.branch));
		if (base === null) throw new Error(`The library has no ${system.branch} branch from ${HOST} to make a change on.`);
		if (kept === null && this.of.empty(change)) throw new Error('There is no change to save.');

		const files = await this.of.files(system, base, change, scope);
		const said = await this.of.lines(system, base, change, scope);
		const message = commitText(this.of, said);

		const branch = kept?.branch ?? newDsnrBranch(this.of.kind, this.deps.now?.() ?? new Date());
		const parent = kept?.tip ?? base;
		const commit = await commitFiles(system.root, base, parent, files, message);
		// The same files as the last save: no commit, but the change as asked is the one saved.
		if (commit === null && kept !== null) {
			this.records.keep(system, scope, { ...kept, saved: change, said });
			return shown({ ...kept, saved: change });
		}
		if (commit === null) throw new Error('This change leaves the library as it is, so there is nothing to save.');
		// From where DSNR left it, or for a new branch only if there is none of that name: never over a commit it did not make.
		await git(system.root, ['update-ref', '-m', `DSNR: ${this.of.saving}`, `refs/heads/${branch}`, commit, kept?.tip ?? '']).catch((err: unknown) => {
			throw new Error(`${branch} has moved since DSNR last saved to it, so nothing was saved. ${errorText(err)}`);
		});
		const next: Kept<C> = {
			...(kept ?? { branch, base, tip: base, saved: change, saves: 0, pullRequest: null }),
			tip: commit,
			saved: change,
			said,
			saves: (kept?.saves ?? 0) + 1,
		};
		this.records.keep(system, scope, next);
		// Once proposed, the pull request has every save.
		if (next.pullRequest) await this.deps.tools(system.root).push(branch);
		return shown(next);
	}

	/** Pushes the branch and opens a draft pull request for it; the one open already, if there is one. */
	async propose(scope = ''): Promise<ChangeBranch<C>> {
		const at = await this.kept(scope);
		if (at === null) throw new Error('Save the change to a branch first; then it can be proposed.');
		const { system, kept } = at;
		const tools = this.deps.tools(system.root);
		await tools.push(kept.branch);
		const open = await tools.findPr(kept.branch);
		// As the last save says it; a branch kept before saves said it is said again from its change.
		const { title, body } = proposalText(this.of, kept.said ?? (await this.of.lines(system, kept.base, kept.saved, scope)));
		// Onto the library's branch, which the branch was made from.
		const pr = open ?? (await tools.createDraftPr(kept.branch, title, body, system.branch));
		const next: Kept<C> = { ...kept, pullRequest: { number: pr.number, url: pr.url, chromatic: kept.pullRequest?.chromatic ?? null } };
		this.records.keep(system, scope, next);
		return shown(next);
	}

	/** Forgets the change's branch, so the next save makes a new one. The branch and its pull request stay. */
	forget(scope = ''): void {
		this.records.forget(scope);
	}

	/** The change's branch as kept, when it is still in the clone where DSNR left it. */
	private async kept(scope: string): Promise<{ system: ConnectedDesignSystem; kept: Kept<C> } | null> {
		const at = this.records.read(scope);
		if (at === null) return null;
		// Forgotten only when git says the branch is gone: a clone it cannot read now (moved, or git timing out) keeps it.
		if (!(await branchExists(at.system.root, at.kept.branch))) {
			this.forget(scope);
			return null;
		}
		return at;
	}

	/** The kept branches that are DSNR's own and whole; anything else in the file is left out. */
	private ownBranches(raw: unknown): Record<string, Kept<C>> {
		return Object.fromEntries(
			Object.entries(asRecord(raw)).flatMap(([key, value]) => {
				const k = asRecord(value);
				const saved = (() => {
					try {
						return this.of.check(k.saved);
					} catch {
						return null;
					}
				})();
				const whole =
					typeof k.branch === 'string' && this.pattern.test(k.branch) && typeof k.tip === 'string' && typeof k.base === 'string' && saved !== null;
				const said = Array.isArray(k.said) && k.said.every((l) => typeof l === 'string') ? (k.said as string[]) : undefined;
				return whole ? [[key, { ...(k as unknown as Kept<C>), saved, said }]] : [];
			}),
		);
	}
}
