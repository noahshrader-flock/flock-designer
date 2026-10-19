/** As axe names it: `html` is cut short, `fix` is what axe says to change. */
export interface AccessibilityElement {
	target: string;
	html: string;
	fix: string;
	state: string;
}

/** `criteria` are WCAG success criteria as "1.4.3"; `nodes` counts every element, `elements` holds only the first few. */
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
 * `incomplete` is for the agent's task and the ledger, not the panel; `bestPractice` is never counted as WCAG. Never a
 * pass: what is left to check by hand is said beside it.
 */
export interface AccessibilityResult {
	ran: { axe: string; tags: string[]; target: string; declared: boolean; at: string; states: string[] };
	violations: AccessibilityIssue[];
	incomplete: AccessibilityIssue[];
	bestPractice: AccessibilityFindings;
	notAutomated: string[];
}

export interface AccessibilityFindings {
	violations: AccessibilityIssue[];
	incomplete: AccessibilityIssue[];
}

export interface AccessibilityCounts {
	violations: number;
	incomplete: number;
}
