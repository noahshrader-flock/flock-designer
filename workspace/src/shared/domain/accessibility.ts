/** What an accessibility check found. */

/**
 * One kind of problem an accessibility check found (T7): the axe rule, what it asks, how serious axe says it is, the WCAG
 * success criteria it checks (as "1.4.3"), on how many elements, where to read about it, and in which of a page's states.
 */
export interface AccessibilityIssue {
	rule: string;
	help: string;
	impact: string | null;
	criteria: string[];
	nodes: number;
	url: string;
	states: string[];
}

/**
 * What an accessibility check found (T7), and what it was made with: axe-core's version, the tags and the target they came
 * from, whether the target was declared, when, and in which states. `violations` are what axe found; `incomplete` what it
 * could not decide, for a person; `notAutomated` the parts of the target no automated check covers. Never a pass: at most,
 * no issues found by automated checks.
 */
export interface AccessibilityResult {
	ran: { axe: string; tags: string[]; target: string; declared: boolean; at: string; states: string[] };
	violations: AccessibilityIssue[];
	incomplete: AccessibilityIssue[];
	notAutomated: string[];
}

/** What a check found: the issues axe found, and the ones it could not decide, for a person. */
export type AccessibilityFindings = Pick<AccessibilityResult, 'violations' | 'incomplete'>;

/** How many of each a check found, as a card says it. */
export interface AccessibilityCounts {
	violations: number;
	incomplete: number;
}
