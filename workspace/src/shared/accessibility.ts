/**
 * Never said as a pass: issues are *to fix*, what axe flagged for a person's eye is *to review*, and what no check reaches
 * is *to check by hand*.
 */
import type { AccessibilityCounts, AccessibilityElement, AccessibilityFindings, AccessibilityIssue, AccessibilityResult } from './contract';
import { plural } from './plural';

/** Enough to find and fix it; the rest are counted. */
export const MOST_ELEMENTS = 10;
/** Its opening is what finds it. */
export const MOST_HTML = 300;

export interface AxeElement {
	target: string;
	html: string;
	fix: string;
}

export interface AxeRule {
	id: string;
	help: string;
	impact: string | null;
	tags: string[];
	helpUrl: string;
	nodes: number;
	elements: AxeElement[];
}

export interface AxeFound {
	violations: AxeRule[];
	incomplete: AxeRule[];
}

export interface AxeRun extends AxeFound {
	state: string;
}

/** `wcag143` is 1.4.3, `wcag2411` is 2.4.11; null for any other tag. */
export const criterionOf = (tag: string): string | null => {
	const m = /^wcag([1-4])(\d)(\d{1,2})$/.exec(tag);
	return m ? `${m[1]}.${m[2]}.${m[3]}` : null;
};

/** It is a page's word, so it is checked before it is used. */
export const isAxeRules = (v: unknown): v is AxeRule[] =>
	Array.isArray(v) &&
	v.every(
		(r) =>
			typeof r === 'object' &&
			r !== null &&
			typeof (r as AxeRule).id === 'string' &&
			typeof (r as AxeRule).help === 'string' &&
			Array.isArray((r as AxeRule).tags) &&
			typeof (r as AxeRule).nodes === 'number' &&
			Array.isArray((r as AxeRule).elements) &&
			(r as AxeRule).elements.every(
				(e) =>
					typeof e === 'object' &&
					e !== null &&
					['target', 'html', 'fix'].every((k) => typeof (e as unknown as Record<string, unknown>)[k] === 'string'),
			),
	);

/** A rule found in several states is listed once, its elements counted in all. */
export const mergeRuns = (runs: AxeRun[]): AccessibilityFindings => {
	const merge = (kind: 'violations' | 'incomplete'): AccessibilityIssue[] => {
		const byRule = new Map<string, AccessibilityIssue>();
		for (const run of runs) {
			for (const rule of run[kind]) {
				const seen = byRule.get(rule.id);
				const elements = rule.elements.map((e) => ({ ...e, state: run.state }));
				if (seen) {
					seen.nodes += rule.nodes;
					if (!seen.states.includes(run.state)) seen.states.push(run.state);
					seen.elements = [...seen.elements, ...elements].slice(0, MOST_ELEMENTS);
					continue;
				}
				byRule.set(rule.id, {
					rule: rule.id,
					help: rule.help,
					impact: rule.impact,
					criteria: rule.tags.flatMap((t) => criterionOf(t) ?? []),
					nodes: rule.nodes,
					url: rule.helpUrl,
					states: [run.state],
					elements: elements.slice(0, MOST_ELEMENTS),
				});
			}
		}
		// The most serious first, as axe ranks them; then by name, so the list reads the same each time.
		const rank = ['critical', 'serious', 'moderate', 'minor'];
		const order = (i: AccessibilityIssue) => (i.impact && rank.includes(i.impact) ? rank.indexOf(i.impact) : rank.length);
		return [...byRule.values()].sort((a, b) => order(a) - order(b) || a.rule.localeCompare(b.rule));
	};
	return { violations: merge('violations'), incomplete: merge('incomplete') };
};

/** Run with every check, said apart, never counted as WCAG. */
export const BEST_PRACTICE = 'best-practice';

/** A rule is the target's when one of its tags is; any other rule axe ran is `bestPractice`, never counted as WCAG. */
export const findingsAt = (runs: AxeRun[], tags: string[]): AccessibilityFindings & { bestPractice: AccessibilityFindings } => {
	const ofTarget = (r: AxeRule) => r.tags.some((t) => tags.includes(t));
	const kept = (keep: (r: AxeRule) => boolean) =>
		runs.map((run) => ({ ...run, violations: run.violations.filter(keep), incomplete: run.incomplete.filter(keep) }));
	return { ...mergeRuns(kept(ofTarget)), bestPractice: mergeRuns(kept((r) => !ofTarget(r))) };
};

export const countsOf = (r: AccessibilityFindings): AccessibilityCounts => ({ violations: r.violations.length, incomplete: r.incomplete.length });

/** None for a page that has only its default. */
export const foundIn = (i: AccessibilityIssue): string[] => (i.states.length > 1 || i.states[0] !== 'default' ? i.states : []);

export const whereFound = (i: AccessibilityIssue): string =>
	`${plural(i.nodes, 'element')}${foundIn(i).length ? `, in ${foundIn(i).join(', ')}` : ''}`;

/** To review is titled in the agent's task only, never in the panel. */
export const TO_FIX_TITLE = 'To fix';
export const TO_REVIEW_TITLE = 'To review';

/**
 * Only what is to fix is counted. What is left is said beside it (`checkedWith`, `notAutomatedLine`), so it is never read
 * as a pass.
 */
export const summaryOf = ({ violations }: AccessibilityCounts): string => (violations ? `${plural(violations, 'issue')} to fix` : 'No issues found');

export const issueLine = (i: AccessibilityIssue): string =>
	[
		i.criteria.length ? `WCAG ${i.criteria.join(', ')}` : null,
		i.impact,
		plural(i.nodes, 'element'),
		foundIn(i).length ? `in ${foundIn(i).join(', ')}` : null,
	]
		.filter(Boolean)
		.join(' · ');

export const fixLine = (e: AccessibilityElement): string => e.fix.replace(/\s+/g, ' ').trim();

export const elementLine = (e: AccessibilityElement): string =>
	`\`${e.target}\`${e.state === 'default' ? '' : ` (in ${e.state})`}${fixLine(e) ? `: ${fixLine(e)}` : ''}`;

export const unlisted = (i: AccessibilityIssue): number => i.nodes - i.elements.length;

/** Their fix is words a person writes (an image's text alternative): said, never written by an agent. */
export const WORDS = new Set(['image-alt', 'role-img-alt', 'svg-img-alt', 'input-image-alt', 'object-alt', 'area-alt']);

export const BEST_PRACTICE_TITLE = 'Best practice, beyond WCAG';

export const checkedWith = (r: AccessibilityResult): string =>
	`axe-core ${r.ran.axe} checked this against ${r.ran.target}${r.ran.states.length > 1 ? `, in ${r.ran.states.join(', ')}` : ''}. What is left is the manual checklist.`;

export const notAutomatedLine = (r: AccessibilityResult): string | null =>
	r.notAutomated.length > 0 ? `Left to check by hand: ${r.notAutomated.join(', ')}.` : null;
