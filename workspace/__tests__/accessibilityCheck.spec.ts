import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type CheckPage, accessibilityOf } from '../src/core/services/accessibility/accessibilityCheck';
import {
	type AxeRule,
	MOST_ELEMENTS,
	countsOf,
	criterionOf,
	elementLine,
	findingsAt,
	mergeRuns,
	summaryOf,
	unlisted,
} from '../src/shared/accessibility';
import { declaredTarget } from '../src/core/services/accessibility/accessibilityBrief';
import { undeclared } from '../src/shared/wcag';

/**
 * Measuring a page's accessibility (T7 of the design system plan, part B): axe's runs, one per state, merged and said
 * the same way everywhere, never as a pass; and each result kept with what it was made with, made again when any of
 * that changes. The windows themselves run only in the app; here, a stand-in gives what axe would.
 */

const rule = (id: string, more: Partial<AxeRule> = {}): AxeRule => ({
	id,
	help: `${id} help`,
	impact: 'serious',
	tags: ['wcag2a', 'wcag111'],
	helpUrl: `https://dequeuniversity.com/rules/axe/4.14/${id}`,
	nodes: 1,
	elements: [{ target: `#${id}`, html: `<b id="${id}">`, fix: `Fix any of the following:\n  ${id} is wrong` }],
	...more,
});

describe('a result', () => {
	it('reads the WCAG success criterion from axe’s tags, and nothing else for one', () => {
		expect(criterionOf('wcag143')).toBe('1.4.3');
		expect(criterionOf('wcag2411')).toBe('2.4.11');
		expect(criterionOf('wcag2a')).toBeNull();
		expect(criterionOf('wcag21aa')).toBeNull();
		expect(criterionOf('best-practice')).toBeNull();
	});

	it('is one list for all of a page’s states: a rule found in several once, its elements counted in all, the most serious first', () => {
		const merged = mergeRuns([
			{ state: 'default', violations: [rule('image-alt', { nodes: 2 }), rule('region', { impact: 'moderate' })], incomplete: [] },
			{
				state: 'empty',
				violations: [rule('image-alt'), rule('button-name', { impact: 'critical', tags: ['wcag412'] })],
				incomplete: [rule('color-contrast', { tags: ['wcag143'] })],
			},
		]);
		expect(merged.violations.map((v) => [v.rule, v.nodes, v.states])).toEqual([
			['button-name', 1, ['empty']],
			['image-alt', 3, ['default', 'empty']],
			['region', 1, ['default']],
		]);
		expect(merged.violations[1]?.criteria).toEqual(['1.1.1']);
		expect(merged.incomplete.map((i) => i.rule)).toEqual(['color-contrast']);
	});

	it('keeps each element it was found on, with what to change, across states, to the first few, and counts the rest', () => {
		const many = Array.from({ length: 8 }, (_, n) => ({
			target: `li:nth-child(${n})`,
			html: '<li>',
			fix: 'Fix all of the following:\n  Add a name',
		}));
		const merged = mergeRuns([
			{ state: 'default', violations: [rule('link-name', { nodes: 8, elements: many })], incomplete: [] },
			{ state: 'empty', violations: [rule('link-name', { nodes: 8, elements: many })], incomplete: [] },
		]);
		const issue = merged.violations[0]!;
		expect(issue.elements).toHaveLength(MOST_ELEMENTS);
		expect(issue.elements.map((e) => e.state)).toEqual([...Array(8).fill('default'), 'empty', 'empty']);
		expect(unlisted(issue)).toBe(6);
		// Said as the agent and the tab say it: the selector, its state when that says something, and what to change.
		expect(elementLine(issue.elements[0]!)).toBe('`li:nth-child(0)`: Fix all of the following: Add a name');
		expect(elementLine(issue.elements[9]!)).toBe('`li:nth-child(1)` (in empty): Fix all of the following: Add a name');
	});

	it('says what axe’s best-practice rules found apart from the target’s, never counted as WCAG', () => {
		const found = findingsAt(
			[
				{
					state: 'default',
					violations: [rule('image-alt'), rule('heading-order', { tags: ['cat.semantics', 'best-practice'] })],
					incomplete: [rule('empty-heading', { tags: ['best-practice'] })],
				},
			],
			['wcag2a'],
		);
		expect(found.violations.map((v) => v.rule)).toEqual(['image-alt']);
		expect(found.incomplete).toEqual([]);
		expect(found.bestPractice.violations.map((v) => v.rule)).toEqual(['heading-order']);
		expect(found.bestPractice.incomplete.map((v) => v.rule)).toEqual(['empty-heading']);
		expect(countsOf(found)).toEqual({ violations: 1, incomplete: 0 });
	});

	it('is said the same way everywhere, and never as a pass', () => {
		const one = mergeRuns([{ state: 'default', violations: [rule('image-alt')], incomplete: [rule('color-contrast'), rule('link-name')] }]);
		// What to do, never what could not be done: only what is to fix is counted; what is flagged for a closer look is not listed.
		expect(summaryOf(countsOf(one))).toBe('1 issue to fix');
		expect(summaryOf({ violations: 3, incomplete: 0 })).toBe('3 issues to fix');
		expect(summaryOf({ violations: 0, incomplete: 0 })).toBe('No issues found');
		expect(summaryOf({ violations: 0, incomplete: 1 })).toBe('No issues found');
		for (const said of [summaryOf({ violations: 0, incomplete: 0 }), summaryOf({ violations: 2, incomplete: 2 })]) {
			expect(said).not.toMatch(/pass|compliant|conform|could not|cannot|unable|automated|person/i);
		}
	});
});

describe('a page’s check', () => {
	let dir: string;
	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'dsnr-a11y-'));
	});
	afterEach(() => rmSync(dir, { recursive: true, force: true }));

	const coke = declaredTarget(
		"## Accessibility conformance target\n\n| | |\n|---|---|\n| **Target** | WCAG 2.0 Level A |\n| **axe tags** | `['wcag2a']` |\n",
		'Coke',
	);
	const check = () =>
		vi.fn<CheckPage>(async (_url, states) =>
			(states.length ? states : ['default']).map((state) => ({ state, violations: [rule('image-alt')], incomplete: [] })),
		);
	const of = (html: string, c: CheckPage, target = coke, states: string[] = []) =>
		accessibilityOf({
			file: join(dir, 'v1.accessibility.json'),
			html,
			url: 'http://127.0.0.1:1/demo/v1',
			states,
			target,
			check: c,
			now: () => new Date('2026-10-10T12:00:00Z'),
		});

	it('runs axe with the target’s tags, in each state, and says what it ran with', async () => {
		const c = check();
		const r = await of('<h1>A</h1>', c, coke, ['default', 'empty']);
		expect(c).toHaveBeenCalledWith('http://127.0.0.1:1/demo/v1', ['default', 'empty'], ['wcag2a']);
		expect(r.ran).toEqual({
			axe: axe.version,
			tags: ['wcag2a'],
			target: 'WCAG 2.0 Level A',
			declared: true,
			at: '2026-10-10T12:00:00.000Z',
			states: ['default', 'empty'],
		});
		expect(r.violations[0]?.states).toEqual(['default', 'empty']);
		expect(r.notAutomated).toEqual([]);
	});

	it('is kept, and given again for the same page at the same target without running axe', async () => {
		const c = check();
		const first = await of('<h1>A</h1>', c);
		expect(await of('<h1>A</h1>', c)).toEqual(first);
		expect(c).toHaveBeenCalledTimes(1);
	});

	it('is made again when the page changes, or the target, and never given as current when it was made with another', async () => {
		const c = check();
		await of('<h1>A</h1>', c);
		await of('<h1>B</h1>', c);
		expect(c).toHaveBeenCalledTimes(2);
		const r = await of('<h1>B</h1>', c, undeclared('Coke has no .dsnr/manifest.md'));
		expect(c).toHaveBeenCalledTimes(3);
		expect(r.ran).toMatchObject({ declared: false, target: 'WCAG 2.1 Level AA, informational: no target declared' });
		// At the default every criterion has an automated check: nothing is left as one no check covers.
		expect(r.notAutomated).toEqual([]);
	});

	it('is made again when an older app kept it, written without what it now holds (each issue’s elements)', async () => {
		const html = '<h1>A</h1>';
		// As an app before the format was raised keyed and wrote it: a match on the page, axe and the target alone.
		const older = createHash('sha256')
			.update(`${html}\0${axe.version}\0${coke.tags.join(',')}\0WCAG 2.0 Level A`)
			.digest('hex');
		writeFileSync(join(dir, 'v1.accessibility.json'), JSON.stringify({ key: older, result: { violations: [], incomplete: [] } }));
		const c = check();
		const r = await of(html, c);
		expect(c).toHaveBeenCalledTimes(1);
		expect(r.violations[0]?.elements).toEqual([{ target: '#image-alt', html: '<b id="image-alt">', fix: expect.any(String), state: 'default' }]);
		expect(r.bestPractice).toEqual({ violations: [], incomplete: [] });
	});

	it('is made again when what was kept cannot be read', async () => {
		const c = check();
		await of('<h1>A</h1>', c);
		writeFileSync(join(dir, 'v1.accessibility.json'), '{not json');
		await of('<h1>A</h1>', c);
		expect(c).toHaveBeenCalledTimes(2);
	});
});
