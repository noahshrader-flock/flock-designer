/**
 * Process changes (PROCESS_CHANGES_PLAN Phase 1), in the core: one unit of review (the tokens, `scope` none; or one
 * component's values, by its story file) handed over to Claude Code, on a branch DSNR names and keeps a record of as it
 * keeps every change's (`changeBranches.ts`), then read from git and proposed as a draft pull request when the person
 * asks. Claude Code commits on the branch, not DSNR. DSNR verifies and does not trust: it starts only on a clean checkout,
 * never with another branch of the unit's in play, never pushes a branch it did not name, never by force, and a branch the
 * rules would flag is proposed only when the person says so.
 *
 * A hand-over, not Handoff: that is codebase work's hand-off to engineering (`engineeringHandoff.ts`).
 */
import type { ChangeBranchOf, HandedChange } from '../../../shared/contract';
import { CHANGE_REQUEST_TEMPLATES } from '../../../shared/hostUrls';
import { asRecord } from '../../../shared/json';
import { type HandoffChange, type HandoffGroup, changeLine, flagged, handoffPrompt, proposalOf } from '../../../shared/processChanges';
import { storyComponent } from '../../../shared/valueNames';
import { tokenEditsOf } from './tokenEdits';
import { triedValuesOf } from './valueSources';
import { reviewBranch } from './branchReview';
import { unfinishedWork } from '../codebase/checkoutClean';
import { libraryCommit } from './designLibrary';
import { dsnrBranchPattern, newDsnrBranch } from './dsnrBranch';
import { git } from '../platform/git';
import { type ChangeBranchesDeps, type Kept, type KindRules, KeptBranches, shownBranch } from './changeBranches';

/**
 * What one unit hands over: its token edits, or a component's values tried, each checked as those always are. Its branches
 * are named `dsnr/handoff-…`, as every prompt since Process changes was built has told Claude Code to name them.
 */
export const HAND_OVER: KindRules<HandedChange> = {
	kind: 'handOver',
	branchWord: 'handoff',
	scope: 'either',
	check: (v) => {
		const r = asRecord(v);
		const keys = Object.keys(r);
		if (keys.length === 1 && keys[0] === 'edits') return { edits: tokenEditsOf(r.edits) };
		if (keys.length === 1 && keys[0] === 'tried') return { tried: triedValuesOf(r.tried) };
		throw new Error('A hand-over is the token edits being tried, or a component’s values tried.');
	},
};

/** A hand-over's branch, as DSNR names it: the only kind it pushes for a hand-over, or shows in place of the library's. */
export const HAND_OVER_BRANCH = dsnrBranchPattern(HAND_OVER.branchWord);

export interface HandOverBranchesDeps extends ChangeBranchesDeps {
	/** The rules for changing a design system's code (`standards/design-system-code.md`), as text. */
	rules: () => Promise<string>;
	/** Each change of a unit as it is handed over: the lines DSNR says it in, and where it is written. */
	changes: (scope: string, change: HandedChange) => Promise<HandoffChange[]>;
	/** What the change reaches, as a pull request says it (`reachLine`). */
	reach: (scope: string, change: HandedChange) => Promise<string>;
	/** Whether the unit has a branch DSNR's Save made: then no hand-over is offered until it is started over. */
	saved: (scope: string) => Promise<boolean>;
}

/** A unit as its prompt names it: the tokens, or a component by its story file's name. */
const groupOf = (scope: string): HandoffGroup =>
	scope === '' ? { kind: 'tokens' } : { kind: 'component', name: storyComponent(scope), file: scope };

export class HandOverBranches extends KeptBranches<HandedChange> {
	constructor(private readonly handOver: HandOverBranchesDeps) {
		super(handOver, HAND_OVER);
	}

	/** Claude Code makes the branch, so one not there yet is still being made. */
	protected stands(): Promise<boolean> {
		return Promise.resolve(true);
	}

	/**
	 * Hands a unit over: refused, in words, without a clean checkout, with a branch of the unit's already in play, or with nothing
	 * (or too much) to hand over; else its branch named and kept, and the prompt to open Claude Code with, in the library's root.
	 */
	async start(scope: string, change: HandedChange): Promise<{ root: string; branch: string; prompt: string }> {
		const system = this.records.system();
		const unfinished = await unfinishedWork(system.root);
		if (unfinished !== null) throw new Error(unfinished);
		if (await this.handOver.saved(scope))
			throw new Error('This has a branch DSNR saved it to. Propose it, or start over, before processing the changes.');
		if ((await this.kept(scope)) !== null) throw new Error('This is handed to Claude Code already. Propose its branch, or start over.');
		const base = await libraryCommit(system.root, system.branch);
		if (base === null) throw new Error(`The library has no ${system.branch} branch from GitHub to make a branch from.`);
		const changes = await this.handOver.changes(scope, change);
		const branch = newDsnrBranch(HAND_OVER.branchWord, this.deps.now?.() ?? new Date());
		const prompt = handoffPrompt({ group: groupOf(scope), changes, branch, base: system.branch, rules: await this.handOver.rules() });
		const kept: Kept<HandedChange> = {
			branch,
			base,
			baseBranch: system.branch,
			tip: null,
			saved: change,
			lines: changes.map(changeLine),
			saves: 0,
			pullRequest: null,
		};
		this.records.keep(system, scope, kept);
		return { root: system.root, branch, prompt };
	}

	/** A unit's hand-over as the panel shows it, its branch read from git now; or null when there is none, or it is done with. */
	async current(scope: string): Promise<ChangeBranchOf<'handOver'> | null> {
		const at = await this.kept(scope);
		if (at === null) return null;
		const { system, kept } = at;
		return { ...shownBranch(kept), review: await reviewBranch(system.root, kept.branch, kept.base, kept.baseBranch) };
	}

	/**
	 * Pushes a unit's branch and opens its draft pull request onto its base, or finds the one open: only the branch DSNR named
	 * and kept, only once it is read ready from git (made from its base, something committed), only at the commit the person
	 * looked at (`tip`), and a flagged one only when `confirmed`.
	 */
	async propose(scope: string, tip: string, confirmed: boolean): Promise<ChangeBranchOf<'handOver'>> {
		const at = await this.kept(scope);
		if (at === null) throw new Error('Nothing is handed to Claude Code for this.');
		const { system, kept } = at;
		const review = await reviewBranch(system.root, kept.branch, kept.base, kept.baseBranch);
		if (review.state === 'missing') throw new Error(`There is no branch ${kept.branch} yet: Claude Code makes it with the name its prompt gave.`);
		if (review.state === 'empty') throw new Error(`Nothing is committed on ${kept.branch} yet: Claude Code commits its work there.`);
		if (review.state === 'off-base') throw new Error(offBase(kept.branch, kept.baseBranch));
		if (review.tip !== tip)
			throw new Error(`Claude Code has committed on ${kept.branch} since it was shown here: look at it again, then propose it.`);
		if (flagged(review) && !confirmed)
			throw new Error('This branch changes what the rules keep out, or more than one sitting’s review: send it on purpose, or start over.');
		const next = await this.open(system, scope, kept, async () =>
			proposalOf({
				group: groupOf(scope),
				lines: kept.lines,
				reach: await this.handOver.reach(scope, kept.saved),
				review,
				base: kept.baseBranch,
				template: await templateIn(system.root, kept.baseBranch),
			}),
		);
		return { ...shownBranch(next), review };
	}
}

/** A branch not made from its base, said the same wherever it is: what is wrong, and what to do. */
export const offBase = (branch: string, base: string): string =>
	`${branch} was not made from ${base}, so it is not proposed or shown. Start over, and process the changes again.`;

/** The repository's pull request template, as GitHub has its base: one found, else none. */
const templateIn = async (root: string, baseBranch: string): Promise<string | null> => {
	const found: string[] = [];
	for (const path of CHANGE_REQUEST_TEMPLATES) {
		const text = await git(root, ['show', `refs/remotes/origin/${baseBranch}:${path}`]).catch(() => null);
		if (text !== null) found.push(text);
	}
	return found.length === 1 ? (found[0] as string) : null;
};
