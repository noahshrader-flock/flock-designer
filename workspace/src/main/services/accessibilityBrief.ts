/**
 * What every agent task says about accessibility (T7 of the design system plan, part A; decision 30): the rules, from the
 * one standard, and the product's target, from its one manifest, put into the task instead of naming a folder the agent
 * may never open. Neither is copied: both are read each time a task is made.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AccessibilityIssue, AccessibilityResult } from '../../shared/contract';
import { axeTagsFor, describeTarget, notAutomated, parseTarget, type DeclaredTarget, undeclared } from '../../shared/wcag';

/** The standard, in the design repository, as the skills are. */
export const ACCESSIBILITY_STANDARD = 'standards/universal/accessibility.md';
/** The product's manifest, in its context folder (`.dsnr`); a design system's, in its own `.dsnr`. */
export const MANIFEST_FILE = 'manifest.md';
export const LIBRARY_MANIFEST = `.dsnr/${MANIFEST_FILE}`;

/** The parts of the standard a task carries: the rules, what to check and record, the checklist, and how to report. */
export const BRIEF_SECTIONS = ['Universal rules', 'What must be checked and recorded', 'The manual checklist', 'Reporting rules'];

/** A `## heading`'s section of a Markdown file, to the next `## `; null when it has none. */
const section = (markdown: string, heading: string): string | null => {
	const lines = markdown.split('\n');
	const start = lines.findIndex((l) => l.trim() === `## ${heading}`);
	if (start < 0) return null;
	const end = lines.findIndex((l, i) => i > start && l.startsWith('## '));
	return lines
		.slice(start, end < 0 ? undefined : end)
		.join('\n')
		.trim();
};

/**
 * The target a manifest declares, in its "Accessibility conformance target" section: its **Target** row ("WCAG 2.0 Level
 * A") and its **axe tags** row (`['wcag2a']`), the same rows the product's own check holds its axe settings to. With no
 * manifest, or no target in it, the default, said to be informational, and why.
 */
export const declaredTarget = (manifest: string | null, where: string): DeclaredTarget => {
	if (manifest === null) return undeclared(`${where} has no .dsnr/${MANIFEST_FILE}`);
	const rows = section(manifest, 'Accessibility conformance target') ?? '';
	const target = parseTarget(/^\|\s*\*\*Target\*\*\s*\|([^|]*)\|/m.exec(rows)?.[1] ?? '');
	if (target === null) return undeclared(`${where}'s .dsnr/${MANIFEST_FILE} declares no accessibility target`);
	const listed = /^\|\s*\*\*axe tags\*\*\s*\|\s*`\[([^\]]*)\]`/m.exec(rows)?.[1];
	const tags = listed === undefined ? axeTagsFor(target) : [...listed.matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1] as string);
	return { declared: true, target, tags, source: `${where}'s .dsnr/${MANIFEST_FILE}` };
};

/** What a check found that is still open, as the agent reads it: what failed, where in WCAG, and on how many elements. */
const issueLine = (i: AccessibilityIssue): string =>
	`- **${i.rule}**${i.criteria.length ? ` (WCAG ${i.criteria.join(', ')})` : ''}: ${i.help}. ${i.nodes} element${i.nodes === 1 ? '' : 's'}${i.states.length > 1 || (i.states[0] && i.states[0] !== 'default') ? `, in ${i.states.join(', ')}` : ''}.`;

/**
 * The accessibility section of a task. `standard` is the standard's text; `target` the product's; `findings`, when the
 * work starts from a prototype that was checked (moving it to code), what that check left open, so none is dropped.
 */
export const accessibilityBrief = ({
	standard,
	target,
	findings,
}: {
	standard: string;
	target: DeclaredTarget;
	findings?: { violations: AccessibilityIssue[]; incomplete: AccessibilityIssue[] } | null;
}): string => {
	const tags = target.tags.map((t) => `\`${t}\``).join(', ');
	const left = notAutomated(target.target);
	return [
		'## Accessibility',
		'',
		'Build toward the target as you go, not at the end: what follows is part of what you make, not a pass after it.',
		'',
		target.declared
			? `This product's target, from ${target.source}: **${describeTarget(target.target)}**, checked with the axe tags ${tags}. Do not state a conformance level yourself: report what you checked and what you found.`
			: `${target.why}, so it declares no target. Build to **${describeTarget(target.target)}** (axe tags ${tags}) as a default, and say in your summary that there was no declared target: what you checked is informational, not a claim.`,
		...(left.length ? ['', `No automated check covers ${left.join(' or ')}: check those criteria by hand, or report them as not run.`] : []),
		...(findings && (findings.violations.length || findings.incomplete.length)
			? [
					'',
					"### What the prototype's check left open",
					'',
					'Fix each in the code, or say in the audit why not. None is dropped by the move.',
					...(findings.violations.length ? ['', 'Found by axe:', ...findings.violations.map(issueLine)] : []),
					...(findings.incomplete.length ? ['', 'For a person to judge (axe could not decide):', ...findings.incomplete.map(issueLine)] : []),
				]
			: []),
		'',
		...BRIEF_SECTIONS.flatMap((h) => {
			const text = section(standard, h);
			// One level down, under the task's own Accessibility heading.
			return text === null ? [] : [text.replace(/^(#+) /gm, '#$1 '), ''];
		}),
	]
		.join('\n')
		.trim();
};

/** A product's target, from the manifest in its guidance folder (`.dsnr`, on the branch worked on), or the default. */
export const productTarget = (guidance: string | null, product: string): DeclaredTarget => {
	const file = guidance === null ? null : join(guidance, MANIFEST_FILE);
	return declaredTarget(file !== null && existsSync(file) ? readFileSync(file, 'utf8') : null, product);
};

/**
 * The accessibility section of a task, made the one way every task makes it: the standard read as the skills are
 * (`readStandard`), at the product's `target`.
 */
export const taskAccessibility = async (
	readStandard: (path: string) => Promise<string>,
	target: DeclaredTarget,
	findings?: { violations: AccessibilityIssue[]; incomplete: AccessibilityIssue[] } | null,
): Promise<string> => accessibilityBrief({ standard: await readStandard(ACCESSIBILITY_STANDARD), target, findings });

/**
 * What a prototype's agent is asked when its page's check found issues (T7, part B): to fix those, and nothing else, as
 * one round of its own check, the way a build error is fixed. Built from the result kept, never from the window's words.
 */
export const fixRequest = (result: AccessibilityResult): string =>
	[
		`The page was checked for accessibility with axe-core ${result.ran.axe}, at ${result.ran.target}, and it found the issues below.`,
		'Fix each one in the source, then build it again. Change nothing else: how the page looks and what it does stay as they are.',
		'Where a fix would change the design, leave it, and say in your summary which one and why.',
		'',
		...result.violations.map(issueLine),
	].join('\n');
