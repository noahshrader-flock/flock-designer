/** What an accessibility check found. */

/**
 * An element an issue was found on, as axe names it (A1 of the accessibility plan): its selector, its HTML (cut short), what
 * axe says to change, and the state it was found in. What lets an agent, or anyone, find it and fix it.
 */
export interface AccessibilityElement {
	target: string;
	html: string;
	fix: string;
	state: string;
}

/**
 * One kind of problem an accessibility check found (T7): the axe rule, what it asks, how serious axe says it is, the WCAG
 * success criteria it checks (as "1.4.3"), on how many elements, where to read about it, in which of a page's states, and
 * the first few of its elements (`MOST_ELEMENTS`), each with what to change.
 */
export interface AccessibilityIssue {
	rule: string;
	help: string;
	impact: string | null;
	criteria: string[];
	nodes: number;
	url: string;
	states: string[];
	elements: AccessibilityElement[];
}

/**
 * What an accessibility check found (T7), and what it was made with: axe-core's version, the tags and the target they came
 * from, whether the target was declared, when, and in which states. `violations` are what axe found, to fix; `incomplete` what
 * it flagged for a closer look (the agent's task and the ledger have it; the panel does not list it); `notAutomated` the
 * parts of the target no automated check covers, left to check by hand. `bestPractice` is what axe's best-practice rules
 * found beside them (a heading out of order, an empty heading): never counted as WCAG, said apart. Never a pass: what was
 * checked and what is left are said beside what was found.
 */
export interface AccessibilityResult {
	ran: { axe: string; tags: string[]; target: string; declared: boolean; at: string; states: string[] };
	violations: AccessibilityIssue[];
	incomplete: AccessibilityIssue[];
	bestPractice: AccessibilityFindings;
	notAutomated: string[];
}

/** What a check found: the issues axe found, and the ones it flagged for a closer look. */
export interface AccessibilityFindings {
	violations: AccessibilityIssue[];
	incomplete: AccessibilityIssue[];
}

/** How many of each a check found, as a card says it. */
export interface AccessibilityCounts {
	violations: number;
	incomplete: number;
}
