import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import axe from 'axe-core';
import { describe, expect, it } from 'vitest';
import { criterionOf } from '../src/shared/accessibility';
import type { AccessibilityIssue, AccessibilityResult } from '../src/shared/contract';
import {
	type Ledger,
	type LedgerRow,
	TEN_CHECKS,
	layersOf,
	ledgerChanges,
	ledgerFaults,
	ledgerOf,
	reviewSection,
	withReviewSection,
} from '../src/main/services/ledger';
import type { CellResult } from '../src/main/services/probe/cells';
import { CRITERIA } from '../src/shared/wcagCriteria';
import { axeTagsFor } from '../src/shared/wcag';

/**
 * The accessibility ledger (A5 of the accessibility plan): each criterion's status from what axe and the probe found, the
 * evidence each rests on, review.md's section written from it, what a gate refuses, and how two runs compare.
 */

const target = {
	declared: true as const,
	target: { version: '2.1' as const, level: 'AA' as const },
	tags: axeTagsFor({ version: '2.1', level: 'AA' }),
	source: 'the manifest',
};
const issue = (rule: string, criteria: string[], states = ['Home']): AccessibilityIssue => ({
	rule,
	help: rule,
	impact: 'serious',
	criteria,
	nodes: 2,
	url: '',
	states,
	elements: [],
});
const result = (violations: AccessibilityIssue[], incomplete: AccessibilityIssue[] = []): AccessibilityResult => ({
	ran: { axe: axe.version, tags: target.tags, target: 'WCAG 2.1 Level AA', declared: true, at: '2026-10-17T10:00:00.000Z', states: ['Home'] },
	violations,
	incomplete,
	bestPractice: { violations: [], incomplete: [] },
	notAutomated: [],
});
const cell = (id: CellResult['cell'], sc: string, status: CellResult['status'], why?: string): CellResult => ({
	cell: id,
	sc,
	status,
	findings: status === 'found' ? [{ target: '#a', detail: 'x' }] : [],
	...(why ? { why } : {}),
});
const ledger = (views: CellResult[], violations: AccessibilityIssue[] = [], incomplete: AccessibilityIssue[] = []): Ledger =>
	ledgerOf({
		key: 'app',
		of: 'Shop’s app',
		result: result(violations, incomplete),
		resultFile: 'projects/p/accessibility/app.json',
		views: [{ state: 'Home', results: views, evidence: 'projects/p/accessibility/app/home/cells.json' }],
		source: [cell('timing', '2.2.1', 'notRun', "this checkout's remote names no default branch")],
		sourceFile: 'projects/p/accessibility/app/source.json',
		target,
		depth: 'full',
	});
const row = (l: Ledger, sc: string) => l.rows.find((r) => r.sc === sc);
const FILE = 'projects/p/accessibility/app.ledger.json';

describe('a ledger', () => {
	const l = ledger(
		[
			cell('focus-visible', '2.4.7', 'found'),
			cell('name-role-value', '4.1.2', 'none'),
			cell('hover-content', '1.4.13', 'notApplicable', 'nothing appeared on hover'),
			cell('reflow', '1.4.10', 'notRun', 'the time was used up'),
		],
		[issue('image-alt', ['1.1.1'])],
		[issue('color-contrast', ['1.4.3'])],
	);

	it('has a row for every criterion of the matrix, each at the target or not', () => {
		expect(l.rows).toHaveLength(55);
		expect(row(l, '2.4.11')?.atTarget).toBe(false);
		expect(row(l, '1.4.10')?.atTarget).toBe(true);
	});

	it('says what was found, by which layer, and rests each status on its evidence file', () => {
		expect(row(l, '1.1.1')).toMatchObject({
			status: 'found',
			found: ['axe image-alt: 2 elements, in Home'],
			evidence: ['projects/p/accessibility/app.json'],
		});
		expect(layersOf(row(l, '1.1.1') as LedgerRow)).toEqual(['axe']);
		expect(row(l, '2.4.7')).toMatchObject({ status: 'found', evidence: ['projects/p/accessibility/app/home/cells.json'] });
		expect(layersOf(row(l, '2.4.7') as LedgerRow)).toEqual(['probe']);
		expect(row(l, '4.1.2')?.status).toBe('measured');
		expect(layersOf(row(l, '4.1.2') as LedgerRow)).toEqual(['axe', 'probe']);
		expect(row(l, '4.1.2')?.evidence.sort()).toEqual(['projects/p/accessibility/app.json', 'projects/p/accessibility/app/home/cells.json']);
	});

	it('says why what was not run was not, and what does not apply, and that "not run" outweighs "measured"', () => {
		expect(row(l, '1.4.10')).toMatchObject({ status: 'notRun', why: 'reflow, in Home: the time was used up' });
		expect(row(l, '1.4.13')).toMatchObject({ status: 'notApplicable', why: 'hover-content, in Home: nothing appeared on hover' });
		expect(row(l, '2.2.1')).toMatchObject({ status: 'notRun', why: "timing, in the source: this checkout's remote names no default branch" });
	});

	it('leaves to a person what no layer reaches, with what they judge, and adds what axe could not decide', () => {
		expect(row(l, '1.3.3')).toMatchObject({ status: 'person', by: [], evidence: [], person: 'copy that names shape, color or position' });
		expect(row(l, '1.4.3')?.person).toBe('what axe could not decide (color-contrast)');
		expect(row(l, '1.1.1')?.person).toBe('alt text is meaningful; decorative vs informative');
	});
});

describe('a light measure', () => {
	// What a build's check and --light run: the tree and the Tab walk alone, and no source read.
	const light = ledger([cell('focus-visible', '2.4.7', 'none'), cell('keyboard-reach', '2.1.1', 'none')]);

	it('says what it did not measure is not run, and why, never a person’s or measured in its place', () => {
		expect(row(light, '1.4.10')).toMatchObject({ status: 'notRun', why: 'reflow was not run in this measure (at full depth)' });
		expect(row(light, '2.1.1')).toMatchObject({ status: 'notRun', why: expect.stringContaining('keyboard-operate was not run in this measure') });
		// Measured by axe and by a cell that did run: still not run, as another cell that measures it did not.
		expect(row(light, '2.4.7')?.status).toBe('measured');
		// What no machine measures stays a person's.
		expect(row(light, '1.3.3')?.status).toBe('person');
	});

	it('says nothing was fixed when what was found is only not measured this time', () => {
		const full = ledger([cell('reflow', '1.4.10', 'found'), cell('focus-visible', '2.4.7', 'found')]);
		const after = ledger([cell('focus-visible', '2.4.7', 'none')]);
		const c = ledgerChanges(full, after);
		expect(c.noLongerFound).toEqual(['2.4.7']);
		expect(c.changed).toContainEqual({ sc: '1.4.10', from: 'found', to: 'notRun' });
	});
});

describe('the matrix and the ten checks', () => {
	it('holds every criterion axe-core has a Level A or AA rule for', () => {
		// Not in the matrix, and rightly: 4.1.1, which WCAG 2.2 took out, and 2.1.3, a AAA criterion one A rule also names.
		const notInIt = new Set(['4.1.1', '2.1.3']);
		const tagged = new Set(
			axe
				.getRules(axeTagsFor({ version: '2.2', level: 'AA' }))
				.flatMap((r) => r.tags.map(criterionOf))
				.filter((sc): sc is string => sc !== null && !notInIt.has(sc)),
		);
		expect([...tagged].filter((sc) => !CRITERIA.some((c) => c.sc === sc))).toEqual([]);
	});

	it('names the ten checks as the standard does, each a view of criteria that are in the matrix', () => {
		const standard = readFileSync(join(__dirname, '../../standards/universal/accessibility.md'), 'utf8');
		const named = [...standard.matchAll(/^\| \d+ \| \*\*([^*]+)\*\* \|/gm)].map((m) => m[1]);
		expect(TEN_CHECKS.map((c) => c.name)).toEqual(named);
		for (const c of TEN_CHECKS)
			for (const sc of c.sc)
				expect(
					CRITERIA.some((r) => r.sc === sc),
					sc,
				).toBe(true);
	});
});

describe('the review record’s accessibility section', () => {
	const l = ledger([cell('reflow', '1.4.10', 'notRun', 'the time was used up'), cell('focus-visible', '2.4.7', 'found')]);
	const section = reviewSection(l, FILE);

	it('is the ten checks from the ledger, and says why each "not run" was not, as a gate asks', () => {
		expect(section).toContain('| 3 | Focus visibility | 2.4.7 Focus Visible: found (probe focus-visible, in Home: 1 finding)');
		expect(section).toContain('- 1.4.10 Reflow: not run, because reflow, in Home: the time was used up');
		for (const line of section.split('\n').filter((x) => /not run/i.test(x) && !x.startsWith('Measured'))) expect(line).toMatch(/because/);
		expect(section.replace('never a pass', '')).not.toMatch(/\bpass(es|ed)?\b/i);
	});

	it('puts beside a check no measure reaches that none does, and best practice beside heading structure, never counted as WCAG', () => {
		const withPractice = { ...l, bestPractice: [{ rule: 'heading-order', line: 'heading-order: 2 elements' }] };
		const text = reviewSection(withPractice, FILE);
		expect(text).toContain('| 4 | Focus management | No machine measures it here | the whole check |');
		expect(text).toMatch(/\| 6 \| Heading structure \| [^|]*best practice, beside WCAG: heading-order: 2 elements \|/);
	});

	it('goes in place of its last one, or at the end, and leaves everything else in review.md as it was', () => {
		const review = '# Review\n\n## Product parity\n\nFine.\n';
		const once = withReviewSection(review, l, FILE);
		expect(once.startsWith(review.trimEnd())).toBe(true);
		const again = withReviewSection(`${once}\n## Implementation review\n\nGood.\n`, ledger([]), FILE);
		expect(again).toContain('## Product parity\n\nFine.');
		expect(again).toContain('## Implementation review\n\nGood.');
		expect(again.match(/<!-- dsnr:accessibility app -->/g)).toHaveLength(1);
		expect(again).toContain(reviewSection(ledger([]), FILE));
		expect(withReviewSection(null, l, FILE)).toBe(`${section}\n`);
	});
});

describe('what a gate refuses', () => {
	const l = ledger([cell('focus-visible', '2.4.7', 'found')]);
	const review = withReviewSection(null, l, FILE);
	const all = () => true;

	it('refuses nothing in a ledger whose every status rests on evidence that is there, and whose review record says it', () => {
		expect(ledgerFaults(l, FILE, all, review)).toEqual([]);
	});

	it('refuses a status resting on a file that is not there, or on none, and one not run with no reason', () => {
		expect(ledgerFaults(l, FILE, (p) => !p.endsWith('cells.json'), review)).toContain(
			'WCAG 2.4.7 rests on projects/p/accessibility/app/home/cells.json, which is not there',
		);
		const bare: Ledger = { ...l, rows: l.rows.map((r) => (r.sc === '1.1.1' ? { ...r, evidence: [] } : r.sc === '2.2.1' ? { ...r, why: '' } : r)) };
		const faults = ledgerFaults(bare, FILE, all, withReviewSection(null, bare, FILE));
		expect(faults).toContain('WCAG 1.1.1 is measured with no evidence file');
		expect(faults).toContain('WCAG 2.2.1 is notRun with no reason');
	});

	it('refuses a review record whose section is not the ledger’s: edited by hand, or missing', () => {
		expect(ledgerFaults(l, FILE, all, review.replace('found (', 'fine ('))).toEqual([expect.stringMatching(/is not the one its ledger writes/)]);
		expect(ledgerFaults(l, FILE, all, null)).toHaveLength(1);
	});
});

describe('two ledgers', () => {
	it('say what is newly found, what is no longer found, and every other change', () => {
		const before = ledger([cell('focus-visible', '2.4.7', 'found'), cell('reflow', '1.4.10', 'none')]);
		const after = ledger([cell('focus-visible', '2.4.7', 'none'), cell('reflow', '1.4.10', 'found')], [issue('image-alt', ['1.1.1'])]);
		const c = ledgerChanges(before, after);
		expect(c.newlyFound.sort()).toEqual(['1.1.1', '1.4.10']);
		expect(c.noLongerFound).toEqual(['2.4.7']);
		expect(c.changed).toContainEqual({ sc: '2.4.7', from: 'found', to: 'measured' });
		expect(ledgerChanges(after, after)).toEqual({ newlyFound: [], noLongerFound: [], changed: [] });
	});
});

describe('the record of a measure', () => {
	it('gives each view a folder of its own, however its name is written, and lists exactly its own files', async () => {
		const { accessibilityViewDirs } = await import('../src/shared/designPaths');
		const dirs = accessibilityViewDirs('p', null, ['Home', 'home!', 'Главная', 'Обзор']);
		expect([...dirs.values()]).toEqual([
			'projects/p/accessibility/app/home',
			'projects/p/accessibility/app/home-2',
			'projects/p/accessibility/app/view',
			'projects/p/accessibility/app/view-2',
		]);
		const { recordFiles } = await import('../src/main/services/accessibilityRecord');
		const { files } = recordFiles(
			{
				projectId: 'p',
				name: null,
				of: 'Shop',
				result: result([]),
				target,
				depth: 'full',
				views: [{ state: 'Home', results: [], files: ['tab.json', 'stops/01.png'] }],
				source: [],
			},
			null,
		);
		const kept = JSON.parse(files.find((f) => f.path === 'projects/p/accessibility/app.json')?.text ?? '{}') as {
			probe: { views: { files: string[] }[] };
		};
		expect(kept.probe.views[0]?.files).toEqual(['cells.json', 'tab.json', 'stops/01.png']);
	});
});
