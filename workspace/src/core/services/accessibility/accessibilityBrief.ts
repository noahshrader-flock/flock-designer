/**
 * What every agent task says about accessibility (T7 of the design system plan, part A; decision 30): the rules, from the
 * one standard, and the product's target, from its one manifest, put into the task instead of naming a folder the agent
 * may never open. Neither is copied: both are read each time a task is made. And the rest a manifest says about it: the
 * pages of the product's own app to check (`appPages`).
 */
import { join } from 'node:path';
import { readText } from '../platform/jsonFile';
import { BEST_PRACTICE_TITLE, TO_FIX_TITLE, TO_REVIEW_TITLE, elementLine, unlisted, whereFound } from '../../../shared/accessibility';
import type { AccessibilityFindings, AccessibilityIssue } from '../../../shared/contract';
import { plural } from '../../../shared/plural';
import { axeTagsFor, describeTarget, notAutomated, parseTarget, type DeclaredTarget, undeclared } from '../../../shared/wcag';

/** The standard, in the design repository, as the skills are. */
export const ACCESSIBILITY_STANDARD = 'standards/universal/accessibility.md';
/** The product's manifest, in its context folder (`.dsnr`); a design system's, in its own `.dsnr`. */
export const MANIFEST_FILE = 'manifest.md';
export const LIBRARY_MANIFEST = `.dsnr/${MANIFEST_FILE}`;

/** The id a product's setup gives its own accessibility check (`.dsnr/workspace.json`), run as codebase work goes. */
export const A11Y_COMMAND = 'a11y';

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

/** A page of a product's own app to check: what it is called, and its address from the app's root. */
export interface AppPage {
	name: string;
	path: string;
}

/** The manifest's section that names the pages of a product's app to check. */
export const PAGES_SECTION = 'Pages to check for accessibility';

/**
 * The pages of its own app a manifest names to check, in its "Pages to check for accessibility" section: a table row each,
 * its name, then its address from the app's root (`| Devices | \`/devices?tab=list\` |`). Only an address on the app itself
 * is taken, never another site's. Null when it names none.
 */
export const appPages = (manifest: string | null): AppPage[] | null => {
	const rows = manifest === null ? '' : (section(manifest, PAGES_SECTION) ?? '');
	const pages = [...rows.matchAll(/^\|\s*([^|]*?)\s*\|\s*`?(\/(?![\/\\])[^|`\s]*)`?\s*\|/gm)].map(([, name, path]) => ({
		name: (name as string).replace(/\*\*/g, '').trim() || (path as string),
		path: path as string,
	}));
	return pages.length > 0 ? pages : null;
};

/** The manifest's section that names the assistive technology testers cover at least (the accessibility plan's decision 3). */
export const ASSISTIVE_SECTION = 'Assistive technology to test with';

/** What a manifest says testers cover at least, a list item each ("VoiceOver with Safari, on macOS"); null when it names none. */
export const assistiveTechnology = (manifest: string | null): string[] | null => {
	const items = (manifest === null ? '' : (section(manifest, ASSISTIVE_SECTION) ?? '')).split('\n').flatMap((l) => {
		const item = /^\s*[-*]\s+(.+)$/.exec(l)?.[1]?.trim();
		return item ? [item] : [];
	});
	return items.length > 0 ? items : null;
};

/**
 * What a check found that is still open, as the agent reads it: what failed, where in WCAG, on how many elements, and each
 * element it lists, by its selector with what axe says to change, so it can be found and fixed.
 */
const openIssue = (i: AccessibilityIssue): string =>
	[
		`- **${i.rule}**${i.criteria.length ? ` (WCAG ${i.criteria.join(', ')})` : ''}: ${i.help}. ${whereFound(i)}.`,
		...i.elements.map((e) => `  - ${elementLine(e)}`),
		...(unlisted(i) > 0 ? [`  - and ${plural(unlisted(i), 'more element')}`] : []),
	].join('\n');

/** What a check found, with what its best-practice rules found beside it when it has them. */
export type CheckFindings = AccessibilityFindings & { bestPractice?: AccessibilityFindings };

/**
 * What a check found, as the agent reads it, titled as the panel titles it: to fix, to review, and best practice apart.
 * Nothing when it found none.
 */
export const findingsLines = (findings: CheckFindings): string[] => [
	...(findings.violations.length ? ['', `${TO_FIX_TITLE}:`, ...findings.violations.map(openIssue)] : []),
	...(findings.incomplete.length ? ['', `${TO_REVIEW_TITLE}:`, ...findings.incomplete.map(openIssue)] : []),
	...(findings.bestPractice?.violations.length ? ['', `${BEST_PRACTICE_TITLE}:`, ...findings.bestPractice.violations.map(openIssue)] : []),
];

/**
 * The accessibility section of a task. `standard` is the standard's text; `target` the product's; `findings`, when the
 * work starts from a prototype that was checked (moving it to code), what that check left open, so none is dropped;
 * `check`, for codebase work, the product's own accessibility command (its `a11y`), to run as the work goes.
 */
export const accessibilityBrief = ({
	standard,
	target,
	findings,
	check = null,
}: {
	standard: string;
	target: DeclaredTarget;
	findings?: CheckFindings | null;
	check?: string | null;
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
		...(left.length ? ['', `Left to check by hand: ${left.join(', ')}. Check them, or report them as not run.`] : []),
		...(check
			? ['', `This product's own accessibility check is \`${check}\`: run it as the work goes, not only at the end. Handoff runs it again.`]
			: []),
		...(findings && (findings.violations.length || findings.incomplete.length || findings.bestPractice?.violations.length)
			? [
					'',
					"### What the prototype's check left open",
					'',
					'Fix each in the code, or say in the audit why not. None is dropped by the move.',
					...findingsLines(findings),
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

/** A product's manifest in its guidance folder (`.dsnr`), as text; null when it has none. */
export const readManifest = (guidance: string | null): string | null => (guidance === null ? null : readText(join(guidance, MANIFEST_FILE)));

/** A product's target, from the manifest in its guidance folder (on the branch worked on), or the default. */
export const productTarget = (guidance: string | null, product: string): DeclaredTarget => declaredTarget(readManifest(guidance), product);

/**
 * The accessibility section of a task, made the one way every task makes it: the standard read as the skills are
 * (`readStandard`), at the product's `target`.
 */
export const taskAccessibility = async (
	readStandard: (path: string) => Promise<string>,
	target: DeclaredTarget,
	findings?: CheckFindings | null,
	check: string | null = null,
): Promise<string> => accessibilityBrief({ standard: await readStandard(ACCESSIBILITY_STANDARD), target, findings, check });
