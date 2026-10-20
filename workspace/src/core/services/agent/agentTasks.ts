import type { BranchAgainstBase, Work } from '../../../shared/contract';
import { againstBaseWords } from '../../../shared/work';
import { NOT_READY_LINE, READY_LINE } from '../../../shared/handoff';
import { type PrototypeBuild, type PrototypeSources, WORKFLOW } from '../prototypes/prototype';
import { HOST } from '../../../shared/vocabulary';
import { plural } from '../../../shared/plural';
import { MOST_ROUNDS } from '../accessibility/buildCheck';

/**
 * Each task begins with the builder's guide (`guidePart`), so no run depends on an agent choosing to open it. The caller
 * reads what goes into a part; this only says where it goes.
 */

/**
 * Its links (`../standards/…`) are pointed at `sharedRoot` (the folder holding `agents/`) so they name real files
 * wherever the task is read; with none known they are left as written.
 */
export const guidePart = (guide: string, sharedRoot: string | null): string =>
	[
		'## How to build UI here: always, before anything else',
		'',
		'This is part of every task, so it is never skipped. Follow it in full. Where the skill below says something more specific for this run, the skill below wins.',
		`Then read \`${sharedRoot === null ? WORKFLOW : `${sharedRoot}/${WORKFLOW}`}\` in full: DSNR's workflow on top of this guide (the project folder, the brief, the context receipt, the reviews). It holds for this task too, and the skill below wins where it is more specific.`,
		'If nobody is there to answer a question, do not stop to ask: make the call, and list it under the product questions you had to guess at when you finish.',
		'',
		(sharedRoot === null ? guide : guide.replaceAll('`../', `\`${sharedRoot}/`)).trim(),
		'',
		'---',
		'',
	].join('\n');

export interface CheckoutParts {
	guide: string;
	/** Null when the workspace file names no `check-iteration`. */
	lightCheck: string | null;
	/** Opened in the editor, the agent is given no other folders, so this says what else it may read. */
	shared: string;
	accessibility: string;
	/** Empty when the design system has none written. */
	voice: string;
}

const lightCheckLine = (lightCheck: string | null): string =>
	lightCheck
		? `This product's light check is \`${lightCheck}\`.`
		: "This product's workspace file names no light check (`check-iteration`): run its type check, lint and the tests for what you changed.";

const routeLine = (recordFile: string): string =>
	`Record the work's route on the \`codebase\` entry of \`${recordFile}\`, as the route skill above says.`;

/** Every run in a checkout commits its work, which an agent's sandbox may refuse. */
const checkoutEnding = ({ lightCheck, shared, accessibility, voice }: CheckoutParts): string[] => [
	'If a sandbox refuses a git command (`git add`, `git commit`), ask the person to let it run outside the sandbox: never leave the work uncommitted. Never push. A commit has no `Co-authored-by` or other attribution line, which some agents add by themselves: the work is the person’s.',
	lightCheckLine(lightCheck),
	...(shared ? ['', shared] : []),
	'',
	accessibility,
	...(voice ? ['', voice] : []),
];

export const handoffTask = (
	{
		skill,
		projectId,
		branch,
		gate,
		missingRoute,
		mergeState,
	}: {
		skill: string;
		projectId: string;
		branch: string;
		gate: string | null;
		/** Given only when the work's record has no route. */
		missingRoute?: { skill: string; recordFile: string } | null;
		/** How the branch merges into the product's default branch, in `againstBaseWords`'s words; null when that cannot be told. */
		mergeState?: string | null;
	},
	parts: CheckoutParts,
): string =>
	parts.guide +
	[
		`Hand ${projectId} to engineering.`,
		'',
		skill.trim(),
		'',
		...(missingRoute ? [missingRoute.skill.trim(), ''] : []),
		'## This run',
		'',
		`The work is on \`${branch}\`, and the checkout is on it. Stay on it.`,
		...(missingRoute ? [`The work's record has no route, so it opens at the app's front door. First: ${routeLine(missingRoute.recordFile)}`] : []),
		gate
			? `This product's gate is \`${gate}\`. Run it first, and last, once HANDOFF.md is committed.`
			: "This product's workspace file names no handoff gate. Say so first in your summary, then follow its guidance for what a handoff checks.",
		`HANDOFF.md's first line is the verdict, alone: \`${READY_LINE}\` or \`${NOT_READY_LINE}\`. DSNR reads it from the committed file once nothing is left uncommitted, so commit all of the work before you finish, and end by saying the same, then why.`,
		...(mergeState
			? [
					`For engineering, who will merge it, put this in HANDOFF.md, under the verdict, as DSNR read it before you started (nothing was merged): "${mergeState}" Do not merge or rebase to change it.`,
				]
			: []),
		'',
		...checkoutEnding(parts),
	].join('\n');

/**
 * Update this branch: the agent merges the latest of the base into the work, in the person's window, never rebasing or
 * rewriting history; DSNR has kept the tip it starts from (`checkpoint`), so undoing it is one command.
 */
export const updateBranchTask = ({ against, checkpoint }: { against: BranchAgainstBase; checkpoint: string }, parts: CheckoutParts): string =>
	parts.guide +
	[
		`Bring \`${against.branch}\` up to date with the latest of \`${against.base}\`.`,
		'',
		'## This run',
		'',
		`- The checkout is on \`${against.branch}\`, with nothing uncommitted. Stay on it.`,
		`- ${againstBaseWords(against)} Merge \`${against.latest}\` into it with \`git merge --no-ff ${against.latest}\`. Merge only: never rebase, reset or rewrite its history, and never push.`,
		...(against.conflicts.length > 0
			? [
					`- Resolve each conflict so both sides' intent survives: the work's, and what ${against.base} changed. Never take one side whole to be done with it. For each file, say what you decided and why.`,
					`- If one cannot be resolved without a decision only a person can make, stop, run \`git merge --abort\`, and say what the decision is.`,
				]
			: []),
		`- DSNR kept where the branch was before: undo the whole update with \`git reset --hard ${checkpoint}\`, if the person asks for it.`,
		'- When it is merged, check it still builds and its tests pass, then commit the merge.',
		'',
		...checkoutEnding(parts),
	].join('\n');

export const buildInCodebaseTask = (
	{
		skill,
		routeSkill,
		pageFile,
		auditFile,
		recordFile,
		name,
		basedOn,
		sourceFile,
	}: {
		skill: string;
		routeSkill: string;
		pageFile: string;
		sourceFile?: string | null;
		auditFile: string;
		recordFile: string;
		name: string;
		basedOn?: Work['basedOn'];
	},
	parts: CheckoutParts,
): string =>
	parts.guide +
	[
		`Build prototype ${name} of this project into the codebase.`,
		'',
		skill.trim(),
		'',
		routeSkill.trim(),
		'',
		'## This run',
		'',
		`The prototype's page is \`${pageFile}\`. Read it; do not change it.`,
		...(sourceFile
			? [`It was written in React with the real design system: its source is \`${sourceFile}\`. Start from that, not from the page.`]
			: []),
		basedOn
			? `It was modeled on \`${basedOn.branch}\` of ${basedOn.repository}${basedOn.commit ? ` at ${basedOn.commit.slice(0, 7)}` : ''}; the code may have moved on since.`
			: 'It was made without the product code to look at, so expect more of it to differ from how the product really works.',
		`Write the audit to \`${auditFile}\` before you change any code.`,
		routeLine(recordFile),
		'',
		...checkoutEnding(parts),
	].join('\n');

/**
 * `number` is the comment's number on its pin. The file keeps every comment, since its pictures are kept in step with it,
 * so which one to act on is said here.
 */
const addressOpening = (number: number, commentsPath: string, subject: string): string[] => [
	`Address comment ${number} on ${subject}, and only that one.`,
	`The comments are in ${commentsPath}, written from ${HOST} a moment ago. Read it first.`,
	`Act on comment ${number} alone. The others are listed for context: leave them, and do not mention them except to say you left them.`,
];

const readableLines = (sources: PrototypeSources): string[] => {
	const line = (label: string, dir: string | null, missing: string) =>
		dir ? `- **${label}:** \`${dir}\`` : `- **${label}:** not on this machine. ${missing}`;
	return [
		'What you may read. **Read only: never change anything in any of these.**',
		'',
		line("The product's code", sources.code, ''),
		line("The product's guidance", sources.productGuidance, "Say so in your summary: the page cannot follow the product's structure without it."),
		line(
			'The design system (guidance and source)',
			sources.designSystemGuidance,
			"Use the installed design system and the product's own code for tokens and components.",
		),
		line('The design system as installed', sources.installedDesignSystem, 'Its version cannot be confirmed; say so.'),
		...(sources.installedAgainstBase ? [`  ${sources.installedAgainstBase} Say so in your summary.`] : []),
		line('Shared standards', sources.sharedStandards, ''),
		line("The product's installed packages", sources.nodeModules, ''),
	];
};

const checkLines = (build: PrototypeBuild): string[] => [
	`- When it builds, check its accessibility with exactly: \`${build.checkCommand}\``,
	`  It measures the page in a real browser at the product's target and says what to fix, as the build says an error: fixing it is part of the work, whatever else was asked. Fix each in \`${build.source}\`, build, and check again. It says when its ${MOST_ROUNDS} rounds are used up: then finish, and what is left is recorded with the page. Never write words it says are a person's.`,
];

/** The request is the person's own words, and comes last, after everything that frames it. */
export const prototypeBuildTask = ({
	guide,
	skill,
	build,
	sources,
	accessibility,
	voice,
	request,
}: {
	guide: string;
	skill: string;
	build: PrototypeBuild;
	sources: PrototypeSources;
	accessibility: string;
	/** Empty when the design repository has none written. */
	voice: string;
	request: string;
}): string =>
	guide +
	[
		skill.trim(),
		'',
		'## This run',
		'',
		`- Write \`${build.source}\`. That file is the whole prototype: nothing else you write is kept.`,
		`- Check it builds, and build it again after every change, with exactly: \`${build.buildCommand}\``,
		`  It writes the page to \`${build.page}\`. Do not finish while it reports an error.`,
		...checkLines(build),
		'',
		...readableLines(sources),
		'',
		accessibility,
		'',
		...(voice ? [voice, ''] : []),
		'## What the person asked for',
		'',
		request.trim(),
	].join('\n');

/** What Refresh to latest asks of a build, as the person's request: they pressed it. Short commits, as people read them. */
export const refreshRequest = ({
	label,
	branch,
	was,
	now,
	newer,
	source,
}: {
	label: string;
	branch: string;
	was: string;
	now: string;
	newer: number;
	source: string;
}): string =>
	`Rebuild ${label} on the latest product code, in place. It was built on ${branch} at ${was.slice(0, 7)}, and is now modeled on ${now.slice(0, 7)}, ${plural(newer, 'commit')} newer. Its source is ${source}: change it there, rather than starting again. Keep the design as it is, and change only what the newer code needs (components, props, imports or types that moved or changed). Say what you changed and why, or that nothing needed changing.`;

/** It carries none of what the reviewer wrote: their words reach the agent only through the file. */
export const prototypeAddressTask = ({
	guide,
	addressSkill,
	buildSkill,
	build,
	sources,
	accessibility,
	voice,
	commentsPath,
	number,
	name,
	where = null,
}: {
	guide: string;
	addressSkill: string;
	buildSkill: string;
	build: PrototypeBuild;
	sources: PrototypeSources;
	accessibility: string;
	/** Empty when the design repository has none written. */
	voice: string;
	commentsPath: string;
	number: number;
	/** The version the comment is on. */
	name: string;
	/** Where the change is made, when that is not the version commented on: see `whereTheChangeGoes`. */
	where?: string | null;
}): string =>
	guide +
	[
		...addressOpening(number, commentsPath, `prototype ${name}`),
		'',
		'## This run',
		'',
		`- This is a prototype: it has no branch, and nothing is committed. Its whole source is \`${build.source}\`; change that file and nothing else.`,
		...(where ? [`- The comment is on ${name}. ${where}`] : []),
		`- After every change, build it with exactly: \`${build.buildCommand}\``,
		`  It writes the page to \`${build.page}\`. Do not finish while it reports an error.`,
		...checkLines(build),
		'',
		...readableLines(sources),
		'',
		accessibility,
		'',
		...(voice ? [voice, ''] : []),
		'## How to act on a comment',
		'',
		addressSkill.trim(),
		'',
		'## How a prototype is made',
		'',
		'Anything you change follows this, as the original page did.',
		'',
		buildSkill.trim(),
	].join('\n');
