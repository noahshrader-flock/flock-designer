/**
 * One unit of review a hand-over, never more, so a pull request is one a reviewer can read. No `vscode` and no `node:`,
 * so it is tested alone.
 */
import type { BranchReview, ChangeReach, DesignToken, TokenEdit, TriedValue, ValuePlace, ValueRow } from './contract';
import { cellFor, triedId } from './contract';
import { plural } from './plural';
import { labelOf, readsAs, withEdits } from './tokens';
import { saidValue, storyComponent, valueTitle } from './valueNames';
import { inGeneratedFolder } from './generatedFolders';

export type HandOverGroup = { kind: 'tokens' } | { kind: 'component'; name: string; file: string };

/** `where` ("src/utils/theme.ts, line 158") is null when DSNR could not find where it is written. */
export interface HandOverChange {
	said: string;
	where: string | null;
}

/** The rules are DSNR's own agent's too, which commits nothing; here, the branch is what DSNR reads. */
export const COMMIT_HERE =
	'Those rules are also given to DSNR’s own agent, which commits nothing. Here, commit your work on the branch above: it is what DSNR reads, draws and proposes. Still install nothing.';

/** A pull request a reviewer can read in one sitting. */
export const MOST_HANDED = 40;

const NOT_PLACED = 'not placed by DSNR';

export const changeLine = (c: HandOverChange): string => `${c.said} (${c.where ?? NOT_PLACED})`;

const unitOf = (group: HandOverGroup): string => (group.kind === 'tokens' ? 'its design tokens' : `the ${group.name} component alone`);

/**
 * Typed into the agent, not sent: the person adds their words and presses Enter. Throws, in words, with nothing to hand
 * over or more than one hand-over carries.
 */
export const handOverPrompt = ({
	group,
	changes,
	branch,
	base,
	rules,
}: {
	group: HandOverGroup;
	changes: HandOverChange[];
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

/** The rules for changing a design system's code allow its own source only; null for one of those files. */
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
	if (inGeneratedFolder(path) || /\.generated\./.test(name)) return 'a generated file';
	if (/\.mdx?$/.test(name) || parts[0] === 'docs') return 'a doc';
	return null;
};

/** Past this, more than a reviewer reads in one sitting for one unit. */
export const LARGE = { files: 10, lines: 300 } as const;

/** Needs a deliberate yes before it is proposed. */
export const flagged = (review: BranchReview): boolean => review.state === 'ready' && (review.large || review.files.some((f) => f.out !== null));

export const tokenChanges = (tokens: DesignToken[], edits: TokenEdit[]): HandOverChange[] => {
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

/** `places` is keyed by `triedId`. */
export const valueChanges = (
	component: string,
	rows: ValueRow[] | null,
	tried: TriedValue[],
	places: ReadonlyMap<string, ValuePlace[]>,
): HandOverChange[] =>
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

/** In the stories drawn, never a claim about every use. */
export const reachLine = (reach: ChangeReach | null): string =>
	reach?.state === 'ready'
		? reach.moved.length === 0
			? `It moves no component, in their stories drawn: ${plural(reach.unchanged, 'component')} unchanged.`
			: `It moves ${plural(reach.moved.length, 'component')} (${reach.moved.map((m) => storyComponent(m.file)).join(', ')}); ${reach.unchanged} unchanged, in their stories drawn.`
		: 'What it moves was not drawn, so it is not checked.';

/** The repository's own template goes in untouched, its boxes left for the person. */
export const proposalOf = ({
	group,
	lines,
	reach,
	review,
	base,
	template,
}: {
	group: HandOverGroup;
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
			`A change to the design system's own code, tried in DSNR and made by an agent, for ${unitOf(group)}.`,
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
