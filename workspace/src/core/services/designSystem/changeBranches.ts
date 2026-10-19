/**
 * Where a change to the library is kept, and how it is proposed: one model for every kind (`ChangeKinds`). What differs is
 * who commits on the branch (DSNR a save at a time, or Claude Code), and what a change writes and how it is said.
 * Kept on disk by design system and `scope`, so the change can be carried on later; forgotten once its pull request closes.
 */
import type { ChangeBranch, ChangeKind, ConnectedDesignSystem } from '../../../shared/contract';
import { asRecord } from '../../../shared/json';
import { libraryCommit } from './designLibrary';
import { dsnrBranchPattern, newDsnrBranch } from './dsnrBranch';
import { branchExists, commitOnto, git } from '../platform/git';
import { ScopedRecords } from './scopedRecords';
import type { ShareTools } from '../../ports';
import { errorText } from '../../../shared/result';
import { HOST } from '../../../shared/vocabulary';

/** What every kind of change is: its name, what its branches are named, what it is kept by, and how a kept one is checked. */
export interface KindRules<C> {
	kind: ChangeKind;
	/** Its branches are `dsnr/<branchWord>-<day>-<hex>`. */
	branchWord: string;
	/** What a change of it is kept by: the design system whole, a component by its story file, or either. */
	scope: 'whole' | 'component' | 'either';
	/** A change as the file of kept branches has it, or as the window sends it; throws, in words, for anything else. */
	check: (saved: unknown) => C;
}

/** A kind DSNR saves itself, a commit for each save: what it writes, and how it is said. */
export interface SavedKindRules<C> extends KindRules<C> {
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

/** What a change of a kind is kept by, as the window names it (a story file, or null for the design system whole), checked against the kind's. */
export const scopeOf = (rules: Pick<KindRules<unknown>, 'kind' | 'scope'>, scope: string | null): string => {
	if (rules.scope === 'whole' && scope !== null)
		throw new Error(`A change of the ${rules.kind} is kept for the design system whole, not one component.`);
	if (rules.scope === 'component' && scope === null) throw new Error(`A change of the ${rules.kind} is kept for one component, by its story file.`);
	return scope ?? '';
};

type Said = Pick<SavedKindRules<unknown>, 'subject' | 'asItWas' | 'about' | 'checked'>;

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
 * What DSNR keeps of a change's branch, the same for every kind: the branch, the library's commit and branch it was made
 * on (`base`, `baseBranch`), the commit DSNR last saved it at (`tip`, to move it only from there; null for one Claude Code
 * commits on), the change and its lines as last saved, how many saves, and its pull request.
 */
export interface Kept<C> {
	branch: string;
	base: string;
	baseBranch: string;
	tip: string | null;
	saved: C;
	lines: string[];
	saves: number;
	pullRequest: ChangeBranch<C>['pullRequest'];
}

/** A branch as the window sees it: without the commits DSNR keeps to make its saves from. */
export const shownBranch = <C>({ branch, saved, lines, saves, pullRequest }: Kept<C>): ChangeBranch<C> => ({
	branch,
	saved,
	lines,
	saves,
	pullRequest,
});

/** What every kind's branches share: the records, a change forgotten once it is done with, the scopes kept, and proposing. */
export abstract class KeptBranches<C, R extends KindRules<C> = KindRules<C>> {
	/** Each change's branch, by its design system and scope. Only a branch DSNR names as its own is ever written to, whatever the file says. */
	protected readonly records: ScopedRecords<Kept<C>>;
	readonly pattern: RegExp;

	constructor(
		protected readonly deps: ChangeBranchesDeps,
		readonly rules: R,
	) {
		this.pattern = dsnrBranchPattern(rules.branchWord);
		this.records = new ScopedRecords(deps.system, deps.file, (raw) => this.whole(raw));
	}

	/** Whether a kept branch still stands in the clone: one DSNR saves to is gone when git says so; one Claude Code makes may not be there yet. */
	protected abstract stands(system: ConnectedDesignSystem, kept: Kept<C>): Promise<boolean>;

	/**
	 * The change kept for `scope`, when it is still being worked on: forgotten once its branch no longer stands, or its pull
	 * request was merged or closed. A host that cannot say now (the command line signed out) keeps it.
	 */
	protected async kept(scope: string): Promise<{ system: ConnectedDesignSystem; kept: Kept<C> } | null> {
		const at = this.records.read(scope);
		if (at === null) return null;
		const { system, kept } = at;
		const pr = kept.pullRequest;
		const done =
			!(await this.stands(system, kept)) ||
			(pr !== null &&
				!(await this.deps
					.tools(system.root)
					.isOpen(pr.number)
					.catch(() => true)));
		if (done) {
			this.forget(scope);
			return null;
		}
		return at;
	}

	/** The scopes with a change kept on the design system shown (the design system whole as an empty one): what the panel's Changes lists. */
	async scopes(): Promise<string[]> {
		const scopes = this.records.scopes();
		const there = await Promise.all(scopes.map(async (scope) => (await this.kept(scope)) !== null));
		return scopes.filter((_, i) => there[i]);
	}

	/** Forgets the change's branch, so the next change makes a new one. The branch and its pull request stay. */
	forget(scope = ''): void {
		this.records.forget(scope);
	}

	/** Pushes a kept branch and opens a draft pull request onto the branch it was made from; the one open already, if there is one. */
	protected async open(
		system: ConnectedDesignSystem,
		scope: string,
		kept: Kept<C>,
		proposal: () => Promise<{ title: string; body: string }>,
	): Promise<Kept<C>> {
		const tools = this.deps.tools(system.root);
		await tools.push(kept.branch);
		let pr = await tools.findPr(kept.branch);
		// Said only when one is opened: the one open already says what it says.
		if (pr === null) {
			const { title, body } = await proposal();
			pr = await tools.createDraftPr(kept.branch, title, body, kept.baseBranch);
		}
		const next: Kept<C> = { ...kept, pullRequest: { number: pr.number, url: pr.url, chromatic: kept.pullRequest?.chromatic ?? null } };
		this.records.keep(system, scope, next);
		return next;
	}

	/** The kept branches that are DSNR's own and whole; anything else in the file is left out. */
	private whole(raw: unknown): Record<string, Kept<C>> {
		return Object.fromEntries(
			Object.entries(asRecord(raw)).flatMap(([key, value]) => {
				const k = asRecord(value);
				const saved = (() => {
					try {
						return this.rules.check(k.saved);
					} catch {
						return null;
					}
				})();
				const pr = asRecord(k.pullRequest);
				const kept: Kept<C> | null =
					typeof k.branch === 'string' &&
					this.pattern.test(k.branch) &&
					typeof k.base === 'string' &&
					typeof k.baseBranch === 'string' &&
					(k.tip === null || typeof k.tip === 'string') &&
					Array.isArray(k.lines) &&
					k.lines.every((l) => typeof l === 'string') &&
					typeof k.saves === 'number' &&
					saved !== null
						? {
								branch: k.branch,
								base: k.base,
								baseBranch: k.baseBranch,
								tip: k.tip as string | null,
								saved,
								lines: k.lines as string[],
								saves: k.saves,
								pullRequest:
									typeof pr.number === 'number' && typeof pr.url === 'string'
										? { number: pr.number, url: pr.url, chromatic: typeof pr.chromatic === 'string' ? pr.chromatic : null }
										: null,
							}
						: null;
				return kept ? [[key, kept]] : [];
			}),
		);
	}
}

/** A commit of `base`'s tree with `files` (path to text) as given, whose parent is `parent`; null when nothing would change. */
const commitFiles = async (root: string, base: string, parent: string, files: Map<string, string>, message: string): Promise<string | null> => {
	const blobs = new Map<string, string>();
	for (const [path, text] of files) blobs.set(path, await git(root, ['hash-object', '-w', '--stdin'], { input: text }));
	return commitOnto(root, base, parent, blobs, message);
};

/** The branches of a kind DSNR saves itself: the tokens, a component's values, the voice and tone. */
export class ChangeBranches<C> extends KeptBranches<C, SavedKindRules<C>> {
	protected stands(system: ConnectedDesignSystem, kept: Kept<C>): Promise<boolean> {
		// Gone only when git says so: a clone it cannot read now (moved, or git timing out) is said, and keeps it.
		return branchExists(system.root, kept.branch);
	}

	/** The change's branch, or null: none was saved, or it is done with. */
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
			const now = { ...kept, pullRequest: { ...kept.pullRequest, chromatic } };
			if (chromatic) this.records.keep(system, scope, now);
			return shownBranch(now);
		}
		return shownBranch(kept);
	}

	/**
	 * Saves `change` as one commit on the branch, made from the library's current commit on the first save. Nothing is
	 * checked out: the person's checkout, index and files are never touched. Each save holds the whole change.
	 */
	async save(change: C, scope = ''): Promise<ChangeBranch<C>> {
		const system = this.records.system();
		const at = await this.kept(scope);
		const kept = at?.kept ?? null;
		const base = kept?.base ?? (await libraryCommit(system.root, system.branch));
		if (base === null) throw new Error(`The library has no ${system.branch} branch from ${HOST} to make a change on.`);
		if (kept === null && this.rules.empty(change)) throw new Error('There is no change to save.');

		const files = await this.rules.files(system, base, change, scope);
		const lines = await this.rules.lines(system, base, change, scope);
		const message = commitText(this.rules, lines);

		const branch = kept?.branch ?? newDsnrBranch(this.rules.branchWord, this.deps.now?.() ?? new Date());
		const parent = kept?.tip ?? base;
		const commit = await commitFiles(system.root, base, parent, files, message);
		// The same files as the last save: no commit, but the change as asked is the one saved.
		if (commit === null && kept !== null) {
			const same = { ...kept, saved: change, lines };
			this.records.keep(system, scope, same);
			return shownBranch(same);
		}
		if (commit === null) throw new Error('This change leaves the library as it is, so there is nothing to save.');
		// From where DSNR left it, or for a new branch only if there is none of that name: never over a commit it did not make.
		await git(system.root, ['update-ref', '-m', `DSNR: ${this.rules.saving}`, `refs/heads/${branch}`, commit, kept?.tip ?? '']).catch(
			(err: unknown) => {
				throw new Error(`${branch} has moved since DSNR last saved to it, so nothing was saved. ${errorText(err)}`);
			},
		);
		const next: Kept<C> = {
			...(kept ?? { branch, base, baseBranch: system.branch, saves: 0, pullRequest: null }),
			tip: commit,
			saved: change,
			lines,
			saves: (kept?.saves ?? 0) + 1,
		};
		this.records.keep(system, scope, next);
		// Once proposed, the pull request has every save.
		if (next.pullRequest) await this.deps.tools(system.root).push(branch);
		return shownBranch(next);
	}

	/** Pushes the branch and opens a draft pull request for it, as its last save says it; the one open already, if there is one. */
	async propose(scope = ''): Promise<ChangeBranch<C>> {
		const at = await this.kept(scope);
		if (at === null) throw new Error('Save the change to a branch first; then it can be proposed.');
		const { system, kept } = at;
		return shownBranch(await this.open(system, scope, kept, async () => proposalText(this.rules, kept.lines)));
	}
}
