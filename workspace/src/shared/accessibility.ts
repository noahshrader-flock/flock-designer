/**
 * What an accessibility check found (T7 of the design system plan, part B), as the app keeps and says it: axe-core's
 * results for each state of a page, merged by rule, with the WCAG success criteria each rule checks, and said in the same
 * words wherever they are shown. Never as a pass: at most, no issues found by automated checks.
 */
import type { AccessibilityCounts, AccessibilityFindings, AccessibilityIssue } from './contract';
import { plural } from './plural';

/** One rule's results in one axe run, as the page gives them back: trimmed to what is kept. */
export interface AxeRule {
	id: string;
	help: string;
	impact: string | null;
	tags: string[];
	helpUrl: string;
	nodes: number;
}

/** What one axe run found, as the page gives it back. */
export interface AxeFound {
	violations: AxeRule[];
	incomplete: AxeRule[];
}

/** One axe run: a page in one of its states. */
export interface AxeRun extends AxeFound {
	state: string;
}

/** The WCAG success criterion an axe tag names (`wcag143` is 1.4.3, `wcag2411` is 2.4.11), or null for any other tag. */
export const criterionOf = (tag: string): string | null => {
	const m = /^wcag([1-4])(\d)(\d{1,2})$/.exec(tag);
	return m ? `${m[1]}.${m[2]}.${m[3]}` : null;
};

/** Whether what a page gave back is an axe run's results, since it is a page's word and is checked before it is used. */
export const isAxeRules = (v: unknown): v is AxeRule[] =>
	Array.isArray(v) &&
	v.every(
		(r) =>
			typeof r === 'object' &&
			r !== null &&
			typeof (r as AxeRule).id === 'string' &&
			typeof (r as AxeRule).help === 'string' &&
			Array.isArray((r as AxeRule).tags) &&
			typeof (r as AxeRule).nodes === 'number',
	);

/** A page's runs, one per state, as one list of each kind: a rule found in several states once, its elements counted in all. */
export const mergeRuns = (runs: AxeRun[]): AccessibilityFindings => {
	const merge = (kind: 'violations' | 'incomplete'): AccessibilityIssue[] => {
		const byRule = new Map<string, AccessibilityIssue>();
		for (const run of runs) {
			for (const rule of run[kind]) {
				const seen = byRule.get(rule.id);
				if (seen) {
					seen.nodes += rule.nodes;
					if (!seen.states.includes(run.state)) seen.states.push(run.state);
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

/** How many of each a check found. */
export const countsOf = (r: AccessibilityFindings): AccessibilityCounts => ({ violations: r.violations.length, incomplete: r.incomplete.length });

/** The states an issue was found in, when that says something: none for a page that has only its default. */
export const foundIn = (i: AccessibilityIssue): string[] => (i.states.length > 1 || i.states[0] !== 'default' ? i.states : []);

/** Where an issue is, in a few words: "2 elements", or "2 elements, in empty". */
export const whereFound = (i: AccessibilityIssue): string =>
	`${plural(i.nodes, 'element')}${foundIn(i).length ? `, in ${foundIn(i).join(', ')}` : ''}`;

/**
 * A result in a few words, the same wherever it is shown: "3 automated issues, 2 need a person", or "No issues found by
 * automated checks". Never a pass.
 */
export const summaryOf = ({ violations, incomplete }: AccessibilityCounts): string => {
	const found = violations ? plural(violations, 'automated issue') : 'No issues found by automated checks';
	return incomplete ? `${found}, ${incomplete} ${incomplete === 1 ? 'needs' : 'need'} a person` : found;
};
