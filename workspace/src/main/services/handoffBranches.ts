/**
 * Process changes (PROCESS_CHANGES_PLAN Phase 1), in the core: one unit of review (the tokens, `scope` none; or one
 * component's values, by its story file) handed to Claude Code, on a branch DSNR names and keeps a record of, then read from git
 * and proposed as a draft pull request when the person asks. DSNR verifies and does not trust: it starts only on a clean
 * checkout, never with another branch of the unit's in play, never pushes a branch it did not name, never by force, and a branch
 * the rules would flag is proposed only when the person says so.
 */
import type { ConnectedDesignSystem, HandedChange, HandoffBranch } from '../../shared/contract';
import { CHANGE_REQUEST_TEMPLATES } from '../../shared/hostUrls';
import { asRecord } from '../../shared/json';
import { type HandoffChange, type HandoffGroup, changeLine, flagged, handoffPrompt, proposalOf } from '../../shared/processChanges';
import { storyComponent } from '../../shared/valueNames';
import { reviewBranch } from './branchReview';
import { unfinishedWork } from './checkoutClean';
import { libraryCommit } from './designLibrary';
import { dsnrBranchPattern, newDsnrBranch } from './dsnrBranch';
import { git } from './git';
import { type JsonFile, jsonFile } from './jsonFile';
import type { ShareTools } from './share';

/** A hand-over as it is kept: its branch, the base it was handed over on (its branch and that commit), what was sent, its pull request. */
interface Kept {
	branch: string;
	baseBranch: string;
	base: string;
	lines: string[];
	change: HandedChange;
	pullRequest: { number: number; url: string } | null;
}

const KIND = 'handoff';
const PATTERN = dsnrBranchPattern(KIND);

export interface HandoffBranchesDeps {
	system: () => ConnectedDesignSystem | null;
	/** Where each unit's hand-over is kept, by its design system and scope. */
	file: string;
	tools: (root: string) => ShareTools;
	/** The rules for changing a design system's code (`standards/design-system-code.md`), as text. */
	rules: () => Promise<string>;
	/** Each change of a unit as it is handed over: the lines DSNR says it in, and where it is written. */
	changes: (scope: string, change: HandedChange) => Promise<HandoffChange[]>;
	/** What the change reaches, as a pull request says it (`reachLine`). */
	reach: (scope: string, change: HandedChange) => Promise<string>;
	/** Whether the unit has a branch DSNR's Save made: then no hand-over is offered until it is started over. */
	saved: (scope: string) => Promise<boolean>;
	now?: () => Date;
}

/** A unit as its prompt names it: the tokens, or a component by its story file's name. */
const groupOf = (scope: string): HandoffGroup =>
	scope === '' ? { kind: 'tokens' } : { kind: 'component', name: storyComponent(scope), file: scope };

export class HandoffBranches {
	private readonly file: JsonFile<Record<string, Kept>>;

	constructor(private readonly deps: HandoffBranchesDeps) {
		this.file = jsonFile(deps.file, { parse: (raw) => ownHandoffs(raw), fallback: {} });
	}

	/**
	 * Hands a unit over: refused, in words, without a clean checkout, with a branch of the unit's already in play, or with nothing
	 * (or too much) to hand over; else its branch named and kept, and the prompt to open Claude Code with, in the library's root.
	 */
	async start(scope: string, change: HandedChange): Promise<{ root: string; branch: string; prompt: string }> {
		const system = this.system();
		const unfinished = await unfinishedWork(system.root);
		if (unfinished !== null) throw new Error(unfinished);
		if (await this.deps.saved(scope))
			throw new Error('This has a branch DSNR saved it to. Propose it, or start over, before handing it to Claude Code.');
		if ((await this.kept(scope)) !== null) throw new Error('This is handed to Claude Code already. Propose its branch, or start over.');
		const base = await libraryCommit(system.root, system.branch);
		if (base === null) throw new Error(`The library has no ${system.branch} branch from GitHub to make a branch from.`);
		const changes = await this.deps.changes(scope, change);
		const branch = newDsnrBranch(KIND, this.deps.now?.() ?? new Date());
		const prompt = handoffPrompt({ group: groupOf(scope), changes, branch, base: system.branch, rules: await this.deps.rules() });
		this.keep(scope, { branch, baseBranch: system.branch, base, lines: changes.map(changeLine), change, pullRequest: null });
		return { root: system.root, branch, prompt };
	}

	/** A unit's hand-over as the panel shows it, its branch read from git now; or null when there is none. */
	async current(scope: string): Promise<HandoffBranch | null> {
		const at = await this.kept(scope);
		if (at === null) return null;
		const { system, kept } = at;
		return {
			branch: kept.branch,
			lines: kept.lines,
			review: await reviewBranch(system.root, kept.branch, kept.base, kept.baseBranch),
			pullRequest: kept.pullRequest,
		};
	}

	/**
	 * Pushes a unit's branch and opens its draft pull request, or finds the one open: only the branch DSNR named and kept, only
	 * once it is read ready from git (made from its base, something committed), and a flagged one only when `confirmed`.
	 */
	async propose(scope: string, confirmed: boolean): Promise<HandoffBranch> {
		const at = await this.kept(scope);
		if (at === null) throw new Error('Nothing is handed to Claude Code for this.');
		const { system, kept } = at;
		if (!PATTERN.test(kept.branch)) throw new Error(`${kept.branch} is not a branch DSNR named, so it is not pushed.`);
		const review = await reviewBranch(system.root, kept.branch, kept.base, kept.baseBranch);
		if (review.state === 'missing') throw new Error(`There is no branch ${kept.branch} yet: Claude Code makes it with the name its prompt gave.`);
		if (review.state === 'empty') throw new Error(`Nothing is committed on ${kept.branch} yet: Claude Code commits its work there.`);
		if (review.state === 'off-base')
			throw new Error(`${kept.branch} was not made from ${kept.baseBranch}, so it is not proposed: start over and hand it over again.`);
		if (flagged(review) && !confirmed)
			throw new Error('This branch changes what the rules keep out, or more than one sitting’s review: send it on purpose, or start over.');
		const tools = this.deps.tools(system.root);
		await tools.push(kept.branch);
		const open = await tools.findPr(kept.branch);
		const { title, body } = proposalOf({
			group: groupOf(scope),
			lines: kept.lines,
			reach: await this.deps.reach(scope, kept.change),
			review,
			base: kept.baseBranch,
			template: await templateIn(system.root, kept.baseBranch),
		});
		const pr = open ?? (await tools.createDraftPr(kept.branch, title, body));
		this.keep(scope, { ...kept, pullRequest: { number: pr.number, url: pr.url } });
		return { branch: kept.branch, lines: kept.lines, review, pullRequest: { number: pr.number, url: pr.url } };
	}

	/** Forgets a unit's hand-over, so it can be handed over again or saved. The branch and any pull request stay. */
	forget(scope: string): void {
		const system = this.deps.system();
		if (!system) return;
		const key = keyOf(system, scope);
		this.file.update((all) => Object.fromEntries(Object.entries(all).filter(([k]) => k !== key)));
	}

	/** The scopes with a hand-over kept on the design system shown: what the panel's Changes lists with nothing tried. */
	scopes(): string[] {
		const system = this.deps.system();
		if (!system) return [];
		const prefix = `${system.id}\u0000`;
		return Object.keys(this.file.read())
			.filter((k) => k.startsWith(prefix))
			.map((k) => k.slice(prefix.length));
	}

	private system(): ConnectedDesignSystem {
		const system = this.deps.system();
		if (system === null) throw new Error('There is no design system connected.');
		return system;
	}

	private async kept(scope: string): Promise<{ system: ConnectedDesignSystem; kept: Kept } | null> {
		const system = this.deps.system();
		if (!system) return null;
		const kept = this.file.read()[keyOf(system, scope)];
		return kept ? { system, kept } : null;
	}

	private keep(scope: string, kept: Kept): void {
		const system = this.system();
		this.file.update((all) => ({ ...all, [keyOf(system, scope)]: kept }));
	}
}

/** A hand-over kept by its design system and its scope, as every branch DSNR keeps is. */
const keyOf = (system: ConnectedDesignSystem, scope: string): string => `${system.id}\u0000${scope}`;

/** The hand-overs kept that are whole and on a branch DSNR named; anything else in the file is left out. */
const ownHandoffs = (raw: unknown): Record<string, Kept> =>
	Object.fromEntries(
		Object.entries(asRecord(raw)).flatMap(([key, value]) => {
			const k = asRecord(value);
			const whole =
				typeof k.branch === 'string' &&
				PATTERN.test(k.branch) &&
				typeof k.base === 'string' &&
				typeof k.baseBranch === 'string' &&
				Array.isArray(k.lines) &&
				k.lines.every((l) => typeof l === 'string') &&
				typeof k.change === 'object' &&
				k.change !== null;
			return whole ? [[key, k as unknown as Kept]] : [];
		}),
	);

/** The repository's pull request template, as GitHub has its base: one found, else none. */
const templateIn = async (root: string, baseBranch: string): Promise<string | null> => {
	const found: string[] = [];
	for (const path of CHANGE_REQUEST_TEMPLATES) {
		const text = await git(root, ['show', `refs/remotes/origin/${baseBranch}:${path}`]).catch(() => null);
		if (text !== null) found.push(text);
	}
	return found.length === 1 ? (found[0] as string) : null;
};
