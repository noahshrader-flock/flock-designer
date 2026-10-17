/**
 * Process changes (PROCESS_CHANGES_PLAN Phase 1): what is tried on one unit of review (the tokens, or one component's values)
 * handed to Claude Code in this window, set up to put it on a branch DSNR names, which DSNR then checks and proposes. One unit
 * a hand-over, never more, so a pull request is one a reviewer can read. No `vscode` and no `node:`, so it is tested alone.
 */
import type { BranchReview, ChangeReach, DesignToken, TokenEdit, TriedValue, ValuePlace, ValueRow } from './contract';
import { cellFor, triedId } from './contract';
import { plural } from './plural';
import { labelOf, readsAs, withEdits } from './tokens';
import { saidValue, storyComponent, valueTitle } from './valueNames';

/** One unit of review: the token changes, or one component's values. */
export type HandoffGroup = { kind: 'tokens' } | { kind: 'component'; name: string; file: string };

/**
 * One change as it is handed over: what it is, as DSNR's controls tried it ("FSButton · Height · sm: 28px → 32px"), and where it
 * is written in the design system's source ("src/utils/theme.ts, line 158"), or null when DSNR could not find where.
 */
export interface HandoffChange {
	said: string;
	where: string | null;
}

/**
 * What turns the rules round for a hand-over: they are DSNR's own agent's too, which commits nothing in a copy DSNR reads;
 * here, the branch is what DSNR reads.
 */
export const COMMIT_HERE =
	'Those rules are also given to DSNR’s own agent, which commits nothing. Here, commit your work on the branch above: it is what DSNR reads, draws and proposes. Still install nothing.';

/** The most changes one hand-over carries: a pull request a reviewer can read in one sitting. */
export const MOST_HANDED = 40;

/** What a change says when DSNR could not find where it is written: the prompt asks Claude Code to find it. */
const NOT_PLACED = 'not placed by DSNR';

/** A change as a line of the prompt and of the pull request: what it is, and where it is written, or that DSNR did not find where. */
export const changeLine = (c: HandoffChange): string => `${c.said} (${c.where ?? NOT_PLACED})`;

/** What the hand-over is of, as the prompt says it. */
const unitOf = (group: HandoffGroup): string => (group.kind === 'tokens' ? 'its design tokens' : `the ${group.name} component alone`);

/**
 * The prompt typed into Claude Code (not sent: the person adds their own words and presses Enter): what this is, the branch to
 * make and from where, what not to do (push, open a pull request, touch another branch: DSNR checks and proposes), the changes,
 * the rules for changing a design system's code (carried, since the library does not have them; its own docs win), with the one
 * the hand-over turns round (commit, on the branch, since that is what DSNR reads), and a last line left open. Throws, in words, with nothing to hand over or more than one hand-over carries.
 */
export const handoffPrompt = ({
	group,
	changes,
	branch,
	base,
	rules,
}: {
	group: HandoffGroup;
	changes: HandoffChange[];
	branch: string;
	base: string;
	rules: string;
}): string => {
	if (changes.length === 0) throw new Error('There is nothing tried to hand over.');
	if (changes.length > MOST_HANDED)
		throw new Error(
			`This is ${changes.length} changes; one hand-over carries at most ${MOST_HANDED}, so its pull request is one a reviewer can read. Reset some, and hand them over in another.`,
		);
	return [
		`Change this design system's own code, as tried in DSNR, for ${unitOf(group)}.`,
		'',
		`First make a branch for it, from the library's ${base} as GitHub has it:`,
		'',
		`    git fetch origin ${base}`,
		`    git switch -c ${branch} origin/${base}`,
		'',
		'Commit your work on that branch. Do not push it, do not open a pull request, and do not change any other branch: DSNR checks the branch and opens the pull request when I ask.',
		'',
		'The changes:',
		...changes.map((c) => `- ${changeLine(c)}`),
		...(changes.some((c) => c.where === null)
			? ['', `Where a change says ${NOT_PLACED}, find where it is written in the design system's own source.`]
			: []),
		'',
		"The rules for changing a design system's code (this repository's own contributing docs win where they differ):",
		'',
		rules.trim(),
		'',
		COMMIT_HERE,
		'',
		'Anything else, in my own words:',
		'',
	].join('\n');
};

/**
 * Why a file a hand-over branch changed is out of bounds, by the rules for changing a design system's code (its own source
 * only: never its stories, tests, docs, Storybook set-up, generated files, or the packages it installs), or null when it is
 * one of its own source files. The rules' own list, one way for every reader.
 */
export const classifyPath = (path: string): string | null => {
	const name = path.split('/').pop() ?? path;
	const parts = path.split('/');
	if (/\.stories\.[cm]?[jt]sx?$|\.stories\.mdx$/.test(name)) return 'a story';
	if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(name) || parts.some((p) => p === '__tests__' || p === '__snapshots__') || name.endsWith('.snap'))
		return 'a test';
	if (parts.includes('.storybook')) return 'the Storybook set-up';
	if (parts[0] === '.github') return 'the repository’s CI and settings';
	if (['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb', 'npm-shrinkwrap.json'].includes(name)) return 'a lockfile';
	if (name === 'package.json') return 'the packages it installs';
	if (parts.some((p) => p === 'node_modules' || p === 'dist' || p === 'build' || p === 'storybook-static') || /\.generated\./.test(name))
		return 'a generated file';
	if (/\.mdx?$/.test(name) || parts[0] === 'docs') return 'a doc';
	return null;
};

/** A hand-over's diff past this is said to be large: more than a reviewer reads in one sitting for one unit. */
export const LARGE = { files: 10, lines: 300 } as const;

/** Whether a branch read ready needs a deliberate yes before it is proposed: a file out of bounds, or a large diff. */
export const flagged = (review: BranchReview): boolean => review.state === 'ready' && (review.large || review.files.some((f) => f.out !== null));

/** The token changes being tried, each as it is handed over: what it is, as a Save's commit says it, and where it is written. */
export const tokenChanges = (tokens: DesignToken[], edits: TokenEdit[]): HandoffChange[] => {
	const read = new Map(tokens.map((t) => [t.path, t]));
	const changed = new Map(withEdits(tokens, edits).map((t) => [t.path, t]));
	return edits.flatMap((e) => {
		const was = read.get(e.path);
		const now = changed.get(e.path);
		return was && now
			? [{ said: `${labelOf(was)}: ${readsAs(was, read)} → ${readsAs(now, changed)}`, where: `${was.source.file}, line ${was.source.line}` }]
			: [];
	});
};

/**
 * The values tried on one component, each as it is handed over: the component, the value as its Values name it ("FSButton ·
 * Height · sm"), what it is drawn as and what it is tried as (or the token it is to follow), and where it is written, as DSNR
 * found it (`places`, by `triedId`), or null when it did not.
 */
export const valueChanges = (
	component: string,
	rows: ValueRow[] | null,
	tried: TriedValue[],
	places: ReadonlyMap<string, ValuePlace[]>,
): HandoffChange[] =>
	tried.map((t) => {
		const cell = cellFor(rows, t);
		const was = cell ? saidValue(t.property, cell.value) : 'as drawn';
		const now = t.follows === undefined ? saidValue(t.property, t.value) : `follows ${t.follows}`;
		const found = places.get(triedId(t)) ?? [];
		return {
			said: `${component} · ${valueTitle(t.property, cell?.variant ?? null)}: ${was} → ${now}`,
			where: found.length === 0 ? null : found.map((p) => `${p.file}, line ${p.line}`).join('; '),
		};
	});

/** What a change reaches, as a pull request says it: in the stories drawn, never a claim about every use; or not checked. */
export const reachLine = (reach: ChangeReach | null): string =>
	reach?.state === 'ready'
		? reach.moved.length === 0
			? `It moves no component, in their stories drawn: ${plural(reach.unchanged, 'component')} unchanged.`
			: `It moves ${plural(reach.moved.length, 'component')} (${reach.moved.map((m) => storyComponent(m.file)).join(', ')}); ${reach.unchanged} unchanged, in their stories drawn.`
		: 'What it moves was not drawn, so it is not checked.';

/**
 * A hand-over branch's draft pull request, as DSNR opens it: titled by its unit and how many changes; what it is, each change,
 * what it reaches, what DSNR checked on the branch (where it was made from, its commits, files and lines, and what was flagged and
 * sent anyway), then the repository's own template untouched, its boxes left for the person.
 */
export const proposalOf = ({
	group,
	lines,
	reach,
	review,
	base,
	template,
}: {
	group: HandoffGroup;
	lines: string[];
	reach: string;
	review: Extract<BranchReview, { state: 'ready' }>;
	base: string;
	template: string | null;
}): { title: string; body: string } => {
	const unit = group.kind === 'tokens' ? 'Design tokens' : group.name;
	const out = review.files.filter((f) => f.out !== null);
	const checked = [
		`Checked by DSNR before it was proposed: made from ${base}; ${plural(review.commits, 'commit')}; ${plural(review.files.length, 'file')}, ${plural(review.lines, 'line')} changed.`,
		...(out.length > 0
			? [`Sent with files the rules keep out of such a change, on purpose: ${out.map((f) => `${f.path} (${f.out})`).join(', ')}.`]
			: []),
		...(review.large ? ['Sent though it is larger than one sitting’s review, on purpose.'] : []),
	];
	return {
		title: `${unit}: ${plural(lines.length, 'change')} from DSNR`,
		body: [
			`A change to the design system's own code, tried in DSNR and made by Claude Code, for ${unitOf(group)}.`,
			'',
			...lines.map((l) => `- ${l}`),
			'',
			reach,
			'',
			...checked,
			...(template ? ['', template.trim()] : []),
			'',
			'_Opened by DSNR as a draft._',
		].join('\n'),
	};
};
