import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type CheckPage, accessibilityOf } from '../src/main/services/accessibilityCheck';
import { type AxeRule, countsOf, criterionOf, mergeRuns, summaryOf } from '../src/shared/accessibility';
import { declaredTarget, fixRequest } from '../src/main/services/accessibilityBrief';
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

	it('is said the same way everywhere, and never as a pass', () => {
		const one = mergeRuns([{ state: 'default', violations: [rule('image-alt')], incomplete: [rule('color-contrast'), rule('link-name')] }]);
		expect(summaryOf(countsOf(one))).toBe('1 automated issue, 2 need a person');
		expect(summaryOf({ violations: 0, incomplete: 0 })).toBe('No issues found by automated checks');
		expect(summaryOf({ violations: 0, incomplete: 1 })).toBe('No issues found by automated checks, 1 needs a person');
		expect(summaryOf({ violations: 0, incomplete: 0 })).not.toMatch(/pass|compliant|conform/i);
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
			file: join(dir, 'v1-i1.accessibility.json'),
			html,
			url: 'http://127.0.0.1:1/demo/v1-i1',
			states,
			target,
			check: c,
			now: () => new Date('2026-10-10T12:00:00Z'),
		});

	it('runs axe with the target’s tags, in each state, and says what it ran with', async () => {
		const c = check();
		const r = await of('<h1>A</h1>', c, coke, ['default', 'empty']);
		expect(c).toHaveBeenCalledWith('http://127.0.0.1:1/demo/v1-i1', ['default', 'empty'], ['wcag2a']);
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
		expect(r.ran).toMatchObject({ declared: false, target: 'WCAG 2.2 Level AA, informational: no target declared' });
		expect(r.notAutomated).toEqual(['WCAG 2.2 Level A']);
	});

	it('is made again when what was kept cannot be read', async () => {
		const c = check();
		await of('<h1>A</h1>', c);
		writeFileSync(join(dir, 'v1-i1.accessibility.json'), '{not json');
		await of('<h1>A</h1>', c);
		expect(c).toHaveBeenCalledTimes(2);
	});

	it('is what the agent is asked to fix, and only that, in a round of its own check', async () => {
		const r = await of('<h1>A</h1>', check());
		const request = fixRequest(r);
		expect(request).toContain(`checked for accessibility with axe-core ${axe.version}, at WCAG 2.0 Level A`);
		expect(request).toContain('Change nothing else');
		expect(request).toContain('- **image-alt** (WCAG 1.1.1): image-alt help. 1 element.');
	});
});
