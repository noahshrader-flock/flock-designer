/**
 * What an accessibility check found (T7 of the design system plan, part B), as the app keeps and says it: axe-core's
 * results for each state of a page, merged by rule, with the WCAG success criteria each rule checks, and said in the same
 * words wherever they are shown. Never as a pass: at most, no issues found by automated checks.
 */
import type { AccessibilityCounts, AccessibilityElement, AccessibilityFindings, AccessibilityIssue, AccessibilityResult } from './contract';
import { plural } from './plural';

/** How many of an issue's elements are kept, with what to change on each: enough to find and fix it; the rest are counted. */
export const MOST_ELEMENTS = 10;
/** How much of an element's HTML is kept: its opening, which is what finds it. */
export const MOST_HTML = 300;

/** One element a rule found, as the page gives it back: axe's selector, its HTML cut short, and what axe says to change. */
export interface AxeElement {
	target: string;
	html: string;
	fix: string;
}

/** One rule's results in one axe run, as the page gives them back: trimmed to what is kept. */
export interface AxeRule {
	id: string;
	help: string;
	impact: string | null;
	tags: string[];
	helpUrl: string;
	nodes: number;
	elements: AxeElement[];
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
			typeof (r as AxeRule).nodes === 'number' &&
			Array.isArray((r as AxeRule).elements) &&
			(r as AxeRule).elements.every(
				(e) =>
					typeof e === 'object' &&
					e !== null &&
					['target', 'html', 'fix'].every((k) => typeof (e as unknown as Record<string, unknown>)[k] === 'string'),
			),
	);

/** A page's runs, one per state, as one list of each kind: a rule found in several states once, its elements counted in all. */
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

/** axe's own tag for the rules it keeps beside WCAG's: run with every check, said apart, never counted as WCAG. */
export const BEST_PRACTICE = 'best-practice';

/**
 * A page's runs as what counts at its target, and the rest said apart: a rule is the target's when one of its tags is one of
 * the target's (`wcag2aa`); any other rule axe ran (its best-practice ones: a heading out of order, an empty heading) is
 * `bestPractice`, never counted as WCAG.
 */
export const findingsAt = (runs: AxeRun[], tags: string[]): AccessibilityFindings & { bestPractice: AccessibilityFindings } => {
	const ofTarget = (r: AxeRule) => r.tags.some((t) => tags.includes(t));
	const kept = (keep: (r: AxeRule) => boolean) =>
		runs.map((run) => ({ ...run, violations: run.violations.filter(keep), incomplete: run.incomplete.filter(keep) }));
	return { ...mergeRuns(kept(ofTarget)), bestPractice: mergeRuns(kept((r) => !ofTarget(r))) };
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

/** An issue, in a line: where in WCAG, how bad, on how many elements and in which states. Its rule's page goes after it. */
export const issueLine = (i: AccessibilityIssue): string =>
	[
		i.criteria.length ? `WCAG ${i.criteria.join(', ')}` : null,
		i.impact,
		plural(i.nodes, 'element'),
		foundIn(i).length ? `in ${foundIn(i).join(', ')}` : null,
	]
		.filter(Boolean)
		.join(' · ');

/** What axe says to change on an element, in one line: its own summary, its lines run together. */
export const fixLine = (e: AccessibilityElement): string => e.fix.replace(/\s+/g, ' ').trim();

/** An element an issue was found on, as a line: axe's selector, the state when that says something, and what to change. */
export const elementLine = (e: AccessibilityElement): string =>
	`\`${e.target}\`${e.state === 'default' ? '' : ` (in ${e.state})`}${fixLine(e) ? `: ${fixLine(e)}` : ''}`;

/** How many of an issue's elements are not listed: counted, never dropped silently. */
export const unlisted = (i: AccessibilityIssue): number => i.nodes - i.elements.length;

/** How the best-practice rules' findings are titled, wherever they are said: beside WCAG, never counted as it. */
export const BEST_PRACTICE_TITLE = 'Best practice, beside WCAG (not counted as it)';

/** What a check was made with, and that it is never a pass: said above what it found, wherever that is listed. */
export const checkedWith = (r: AccessibilityResult): string =>
	`Checked with axe-core ${r.ran.axe} at ${r.ran.target}${r.ran.states.length > 1 ? `, in ${r.ran.states.join(', ')}` : ''}. Automated checks find about half of the problems WCAG covers: this is not a pass, and the manual checklist is a person’s.`;

/** What no automated check covers, for a person to check; null when every criterion has one. */
export const notAutomatedLine = (r: AccessibilityResult): string | null =>
	r.notAutomated.length > 0 ? `No automated check covers ${r.notAutomated.join(' or ')}: those criteria are a person’s to check.` : null;
