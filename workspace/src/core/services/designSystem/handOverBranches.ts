/**
 * DSNR verifies, never trusts: a clean checkout only, never pushes a branch it did not name, never by force. Not Handoff,
 * which is codebase work's hand-off to engineering (`engineeringHandoff.ts`).
 */
import type { ChangeBranchOf, HandedChange } from '../../../shared/contract';
import { CHANGE_REQUEST_TEMPLATES } from '../../../shared/hostUrls';
import { asRecord } from '../../../shared/json';
import { type HandOverChange, type HandOverGroup, changeLine, flagged, handOverPrompt, proposalOf } from '../../../shared/processChanges';
import { storyComponent } from '../../../shared/valueNames';
import { tokenEditsOf } from './tokenEdits';
import { triedValuesOf } from './valueSources';
import { reviewBranch } from './branchReview';
import { unfinishedWork } from '../codebase/checkoutClean';
import { libraryCommit } from './designLibrary';
import { dsnrBranchPattern, newDsnrBranch } from './dsnrBranch';
import { git } from '../platform/git';
import { type ChangeBranchesDeps, type Kept, type KindRules, KeptBranches, shownBranch } from './changeBranches';

/** Branches are named `dsnr/handoff-…`, as the prompt tells the agent to name them. */
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

/** The only branches a hand-over pushes, or shows in place of the library's. */
export const HAND_OVER_BRANCH = dsnrBranchPattern(HAND_OVER.branchWord);

export interface HandOverBranchesDeps extends ChangeBranchesDeps {
	rules: () => Promise<string>;
	changes: (scope: string, change: HandedChange) => Promise<HandOverChange[]>;
	reach: (scope: string, change: HandedChange) => Promise<string>;
	/** True blocks a hand-over until the saved branch is started over. */
	saved: (scope: string) => Promise<boolean>;
}

const groupOf = (scope: string): HandOverGroup =>
	scope === '' ? { kind: 'tokens' } : { kind: 'component', name: storyComponent(scope), file: scope };

export class HandOverBranches extends KeptBranches<HandedChange> {
	constructor(private readonly handOver: HandOverBranchesDeps) {
		super(handOver, HAND_OVER);
	}

	/** The agent makes the branch, so one not there yet is still being made. */
	protected stands(): Promise<boolean> {
		return Promise.resolve(true);
	}

	async start(scope: string, change: HandedChange): Promise<{ root: string; branch: string; prompt: string }> {
		const system = this.records.system();
		const unfinished = await unfinishedWork(system.root, 'the design system’s checkout');
		if (unfinished !== null) throw new Error(unfinished);
		if (await this.handOver.saved(scope))
			throw new Error('This has a branch DSNR saved it to. Propose it, or start over, before processing the changes.');
		if ((await this.kept(scope)) !== null) throw new Error('This is handed to an agent already. Propose its branch, or start over.');
		const base = await libraryCommit(system.root, system.branch);
		if (base === null) throw new Error(`The library has no ${system.branch} branch from GitHub to make a branch from.`);
		const changes = await this.handOver.changes(scope, change);
		const branch = newDsnrBranch(HAND_OVER.branchWord, this.deps.now?.() ?? new Date());
		const prompt = handOverPrompt({ group: groupOf(scope), changes, branch, base: system.branch, rules: await this.handOver.rules() });
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

	async current(scope: string): Promise<ChangeBranchOf<'handOver'> | null> {
		const at = await this.kept(scope);
		if (at === null) return null;
		const { system, kept } = at;
		return { ...shownBranch(kept), review: await reviewBranch(system.root, kept.branch, kept.base, kept.baseBranch) };
	}

	async propose(scope: string, tip: string, confirmed: boolean): Promise<ChangeBranchOf<'handOver'>> {
		const at = await this.kept(scope);
		if (at === null) throw new Error('Nothing is handed to an agent for this.');
		const { system, kept } = at;
		const review = await reviewBranch(system.root, kept.branch, kept.base, kept.baseBranch);
		if (review.state === 'missing') throw new Error(`There is no branch ${kept.branch} yet: the agent makes it with the name its prompt gave.`);
		if (review.state === 'empty') throw new Error(`Nothing is committed on ${kept.branch} yet: the agent commits its work there.`);
		if (review.state === 'off-base') throw new Error(offBase(kept.branch, kept.baseBranch));
		if (review.tip !== tip) throw new Error(`The agent has committed on ${kept.branch} since it was shown here: look at it again, then propose it.`);
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

export const offBase = (branch: string, base: string): string =>
	`${branch} was not made from ${base}, so it is not proposed or shown. Start over, and process the changes again.`;

const templateIn = async (root: string, baseBranch: string): Promise<string | null> => {
	const found: string[] = [];
	for (const path of CHANGE_REQUEST_TEMPLATES) {
		const text = await git(root, ['show', `refs/remotes/origin/${baseBranch}:${path}`]).catch(() => null);
		if (text !== null) found.push(text);
	}
	return found.length === 1 ? (found[0] as string) : null;
};
