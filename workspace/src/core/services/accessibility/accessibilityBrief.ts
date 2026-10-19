// Put into the task instead of naming a folder the agent may never open; neither is copied, both are read each time.
import { join } from 'node:path';
import { readText } from '../platform/jsonFile';
import { BEST_PRACTICE_TITLE, TO_FIX_TITLE, TO_REVIEW_TITLE, elementLine, unlisted, whereFound } from '../../../shared/accessibility';
import type { AccessibilityFindings, AccessibilityIssue } from '../../../shared/contract';
import { plural } from '../../../shared/plural';
import { axeTagsFor, describeTarget, notAutomated, parseTarget, type DeclaredTarget, undeclared } from '../../../shared/wcag';

export const ACCESSIBILITY_STANDARD = 'standards/universal/accessibility.md';
export const MANIFEST_FILE = 'manifest.md';
export const LIBRARY_MANIFEST = `.dsnr/${MANIFEST_FILE}`;

export const A11Y_COMMAND = 'a11y';

export const BRIEF_SECTIONS = ['Universal rules', 'What must be checked and recorded', 'The manual checklist', 'Reporting rules'];

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
 * The same **Target** and **axe tags** rows the product's own check holds its axe settings to. With no manifest, or no
 * target in it, the default, said to be informational, and why.
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

export interface AppPage {
	name: string;
	/** From the app's root. */
	path: string;
}

export const PAGES_SECTION = 'Pages to check for accessibility';

/** Only an address on the app itself is taken, never another site's. */
export const appPages = (manifest: string | null): AppPage[] | null => {
	const rows = manifest === null ? '' : (section(manifest, PAGES_SECTION) ?? '');
	const pages = [...rows.matchAll(/^\|\s*([^|]*?)\s*\|\s*`?(\/(?![\/\\])[^|`\s]*)`?\s*\|/gm)].map(([, name, path]) => ({
		name: (name as string).replace(/\*\*/g, '').trim() || (path as string),
		path: path as string,
	}));
	return pages.length > 0 ? pages : null;
};

export const ASSISTIVE_SECTION = 'Assistive technology to test with';

export const assistiveTechnology = (manifest: string | null): string[] | null => {
	const items = (manifest === null ? '' : (section(manifest, ASSISTIVE_SECTION) ?? '')).split('\n').flatMap((l) => {
		const item = /^\s*[-*]\s+(.+)$/.exec(l)?.[1]?.trim();
		return item ? [item] : [];
	});
	return items.length > 0 ? items : null;
};

const openIssue = (i: AccessibilityIssue): string =>
	[
		`- **${i.rule}**${i.criteria.length ? ` (WCAG ${i.criteria.join(', ')})` : ''}: ${i.help}. ${whereFound(i)}.`,
		...i.elements.map((e) => `  - ${elementLine(e)}`),
		...(unlisted(i) > 0 ? [`  - and ${plural(unlisted(i), 'more element')}`] : []),
	].join('\n');

export type CheckFindings = AccessibilityFindings & { bestPractice?: AccessibilityFindings };

/** Titled as the panel titles it. */
export const findingsLines = (findings: CheckFindings): string[] => [
	...(findings.violations.length ? ['', `${TO_FIX_TITLE}:`, ...findings.violations.map(openIssue)] : []),
	...(findings.incomplete.length ? ['', `${TO_REVIEW_TITLE}:`, ...findings.incomplete.map(openIssue)] : []),
	...(findings.bestPractice?.violations.length ? ['', `${BEST_PRACTICE_TITLE}:`, ...findings.bestPractice.violations.map(openIssue)] : []),
];

/** `findings`: what a checked prototype's check left open, when the work moves it to code, so none is dropped. */
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

export const readManifest = (guidance: string | null): string | null => (guidance === null ? null : readText(join(guidance, MANIFEST_FILE)));

export const productTarget = (guidance: string | null, product: string): DeclaredTarget => declaredTarget(readManifest(guidance), product);

export const taskAccessibility = async (
	readStandard: (path: string) => Promise<string>,
	target: DeclaredTarget,
	findings?: CheckFindings | null,
	check: string | null = null,
): Promise<string> => accessibilityBrief({ standard: await readStandard(ACCESSIBILITY_STANDARD), target, findings, check });
