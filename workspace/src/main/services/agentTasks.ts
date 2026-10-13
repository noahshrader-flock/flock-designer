import type { Iteration } from '../../shared/contract';
import { NOT_READY_LINE, READY_LINE } from '../../shared/handoff';
import type { PrototypeBuild, PrototypeSources } from './prototype';
import { HOST } from '../../shared/vocabulary';

/**
 * Every task an agent is given, put together here, one function per kind of run, so each gets the same parts in the
 * same order and none is missed (a run that left one out is how Build in the codebase once went without the light
 * check and the shared folders). What goes into a part (a skill's text, the product's target, the voice) is read by
 * the caller; this only says where it goes.
 *
 * - **A run in a product checkout** (codebase work, Address on a branch, Handoff, moving a prototype into the code) ends
 *   with `CheckoutParts`, always in this order: the product's light check, the shared folders it may read, the
 *   accessibility rules and target, the voice and tone.
 * - **A prototype run** (building one, changing one for a comment) says what it may read, then the accessibility rules
 *   and target and the voice and tone, and the person's request last, after everything that frames it.
 */

/** What every run in a product checkout is given besides its own task. */
export interface CheckoutParts {
	/** The product's light check (its workspace file's `check-iteration`), or null when it names none. */
	lightCheck: string | null;
	/** What else it may read, read only (`sharedGuidance().note`): opened in the editor, it is given no other folders. */
	shared: string;
	/** The accessibility section (`taskAccessibility`): the rules, and the product's target. */
	accessibility: string;
	/** The voice and tone section (`taskVoice`): empty when the design system has none written. */
	voice: string;
}

const lightCheckLine = (lightCheck: string | null): string =>
	lightCheck
		? `This product's light check is \`${lightCheck}\`.`
		: "This product's workspace file names no light check (`check-iteration`): run its type check, lint and the tests for what you changed.";

/** How every run in a product checkout ends, the same way for each. */
const checkoutEnding = ({ lightCheck, shared, accessibility, voice }: CheckoutParts): string[] => [
	lightCheckLine(lightCheck),
	...(shared ? ['', shared] : []),
	'',
	accessibility,
	...(voice ? ['', voice] : []),
];

/**
 * A run on codebase work, or any other the person starts in a checkout: `unattended` is the shared skill for unattended
 * codebase work, given on the project's codebase branch, before the task.
 */
export const codebaseTask = ({ unattended, task }: { unattended: string | null; task: string }, parts: CheckoutParts): string =>
	[...(unattended ? [unattended.trim(), '', '---', ''] : []), task.trim(), '', ...checkoutEnding(parts)].join('\n');

export const handoffTask = (
	{
		skill,
		projectId,
		branch,
		gate,
	}: {
		skill: string;
		projectId: string;
		branch: string;
		gate: string | null;
	},
	parts: CheckoutParts,
): string =>
	[
		`Hand ${projectId} to engineering.`,
		'',
		skill.trim(),
		'',
		'## This run',
		'',
		`The work is on \`${branch}\`, and the checkout is on it. Stay on it.`,
		gate
			? `This product's gate is \`${gate}\`. Run it first, and last, once HANDOFF.md is committed.`
			: "This product's workspace file names no handoff gate. Say so first in your summary, then follow its guidance for what a handoff checks.",
		`Finish by saying, on its own line, either \`${READY_LINE}\` or \`${NOT_READY_LINE}\`, then why.`,
		'',
		...checkoutEnding(parts),
	].join('\n');

/** What the agent is told when a prototype moves into the codebase: audit first, then build. */
export const moveToCodeTask = (
	{
		skill,
		pageFile,
		auditFile,
		name,
		basedOn,
		sourceFile,
	}: {
		skill: string;
		pageFile: string;
		/** The React source, when the prototype was written in React. */
		sourceFile?: string | null;
		auditFile: string;
		name: string;
		basedOn?: Iteration['basedOn'];
	},
	parts: CheckoutParts,
): string =>
	[
		`Build prototype ${name} of this project into the codebase.`,
		'',
		skill.trim(),
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
		'',
		...checkoutEnding(parts),
	].join('\n');

/**
 * How every address task begins, on a branch or on a prototype. `number` is the comment to act on -- the number the
 * designer read off its pin. The file still holds every comment, because it is the project's file and its pictures
 * are kept in step with it, so which one to act on is said here rather than by narrowing the file.
 */
const addressOpening = (number: number, commentsPath: string, subject: string): string[] => [
	`Address comment ${number} on ${subject}, and only that one.`,
	`The comments are in ${commentsPath}, written from ${HOST} a moment ago. Read it first.`,
	`Act on comment ${number} alone. The others are listed for context: leave them, and do not mention them except to say you left them.`,
];

/**
 * The task the agent is given on a branch. It names the skill, the file and the branch, all of which this app
 * produced, and **none of what a reviewer wrote**: their words reach the agent only through the file, quoted,
 * under a heading that says they are feedback and not instructions.
 */
export const addressTask = (commentsPath: string, branch: string, skill: string, only: number): string =>
	[
		...addressOpening(only, commentsPath, 'this project'),
		`This iteration's branch is ${branch}.`,
		'',
		'Follow these instructions:',
		'',
		skill.trim(),
	].join('\n');

/** What a prototype's agent may read, said the same way for building one and for changing one. */
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
		line('Shared standards', sources.sharedStandards, ''),
		line("The product's installed packages", sources.nodeModules, ''),
	];
};

/**
 * What the agent is told for a prototype. The skill says how; this says where everything is. The
 * request is the person's own words, and comes last, after everything that frames it.
 */
export const prototypeBuildTask = ({
	skill,
	build,
	sources,
	accessibility,
	voice,
	request,
}: {
	skill: string;
	build: PrototypeBuild;
	sources: PrototypeSources;
	/** The accessibility section (`taskAccessibility`): the rules and the product's target. */
	accessibility: string;
	/** The voice and tone section (`taskVoice`): empty when the design repository has none written. */
	voice: string;
	request: string;
}): string =>
	[
		skill.trim(),
		'',
		'## This run',
		'',
		`- Write \`${build.source}\`. That file is the whole prototype: nothing else you write is kept.`,
		`- Check it builds, and build it again after every change, with exactly: \`${build.buildCommand}\``,
		`  It writes the page to \`${build.page}\`. Do not finish while it reports an error.`,
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

/**
 * What the agent is told to act on one comment on a prototype. The same comments file and the same shared skill as
 * on a branch, plus how a prototype is made, since the change is made to one. Like the branch task, it carries none
 * of what the reviewer wrote: their words reach the agent only through the file.
 */
export const prototypeAddressTask = ({
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
	addressSkill: string;
	buildSkill: string;
	build: PrototypeBuild;
	sources: PrototypeSources;
	/** The accessibility section (`taskAccessibility`). */
	accessibility: string;
	/** The voice and tone section (`taskVoice`): empty when the design repository has none written. */
	voice: string;
	commentsPath: string;
	/** The comment's number, as on its pin. */
	number: number;
	/** The iteration the comment is on. */
	name: string;
	/** Where the change is made, when that is not the iteration commented on: see `whereTheChangeGoes`. */
	where?: string | null;
}): string =>
	[
		...addressOpening(number, commentsPath, `prototype ${name}`),
		'',
		'## This run',
		'',
		`- This is a prototype: it has no branch, and nothing is committed. Its whole source is \`${build.source}\`; change that file and nothing else.`,
		...(where ? [`- The comment is on ${name}. ${where}`] : []),
		`- After every change, build it with exactly: \`${build.buildCommand}\``,
		`  It writes the page to \`${build.page}\`. Do not finish while it reports an error.`,
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
