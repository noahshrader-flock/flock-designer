import axe from 'axe-core';
import type { AccessibilityIssue, AccessibilityResult } from '../../src/shared/contract';
import type { CellResult } from '../../src/core/services/probe/cells';
import { type DeclaredTarget, axeTagsFor } from '../../src/shared/wcag';

/** What the accessibility specs build their measures from (A5, A8, A9): a target, what axe found, what a cell found. */

/** WCAG 2.1 AA, declared by the product's manifest. */
export const AA: DeclaredTarget = { declared: true, target: { version: '2.1', level: 'AA' }, tags: axeTagsFor({ version: '2.1', level: 'AA' }), source: 'the manifest' };

/** An issue axe found, on two elements, in Home unless said. */
export const issue = (rule: string, criteria: string[], states = ['Home']): AccessibilityIssue => ({
	rule,
	help: rule,
	impact: 'serious',
	criteria,
	nodes: 2,
	url: '',
	states,
	elements: [],
});

/** A result of axe's at `target`, in Home, with what it found, could not decide, and found by its best-practice rules. */
export const result = (violations: AccessibilityIssue[], incomplete: AccessibilityIssue[] = [], bestPractice: AccessibilityIssue[] = [], target = AA): AccessibilityResult => ({
	ran: { axe: axe.version, tags: target.tags, target: 'WCAG 2.1 Level AA', declared: true, at: '2026-10-17T10:00:00.000Z', states: ['Home'] },
	violations,
	incomplete,
	bestPractice: { violations: bestPractice, incomplete: [] },
	notAutomated: [],
});

/** What a probe cell found: one finding when found, and why when it was not run or does not apply. */
export const cell = (id: CellResult['cell'], sc: string, status: CellResult['status'], why?: string): CellResult => ({
	cell: id,
	sc,
	status,
	findings: status === 'found' ? [{ target: '#a', detail: 'x' }] : [],
	...(why ? { why } : {}),
});
