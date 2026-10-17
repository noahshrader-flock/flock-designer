import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import axe from 'axe-core';
import { describe, expect, it } from 'vitest';
import { guardLines, guardsFor, stacksOf } from '../src/main/services/guards';
import { type Ledger, ledgerOf } from '../src/main/services/ledger';
import type { CellResult } from '../src/main/services/probe/cells';
import { parseReturned, returnedTemplate, sortReturned, withGaps } from '../src/main/services/returned';
import type { AccessibilityIssue } from '../src/shared/contract';
import { axeTagsFor } from '../src/shared/wcag';

/**
 * Keeping it fixed (A9 of the accessibility plan): what testers send back, read without retyping and sorted by what was
 * measured, its escapes logged once in the product's agent gap log; and a guard proposed for what was fixed.
 */

const target = {
	declared: true as const,
	target: { version: '2.1' as const, level: 'AA' as const },
	tags: axeTagsFor({ version: '2.1', level: 'AA' }),
	source: 'the manifest',
};
const issue = (rule: string, criteria: string[]): AccessibilityIssue => ({
	rule,
	help: rule,
	impact: 'serious',
	criteria,
	nodes: 1,
	url: '',
	states: ['Home'],
	elements: [],
});
const cell = (id: CellResult['cell'], sc: string, status: CellResult['status'], why?: string): CellResult => ({
	cell: id,
	sc,
	status,
	findings: [],
	...(why ? { why } : {}),
});
const ledger = (violations: AccessibilityIssue[], views: CellResult[]): Ledger =>
	ledgerOf({
		key: 'app',
		of: 'Shop’s app',
		result: {
			ran: { axe: axe.version, tags: target.tags, target: 'WCAG 2.1 Level AA', declared: true, at: '2026-10-17T10:00:00.000Z', states: ['Home'] },
			violations,
			incomplete: [],
			bestPractice: { violations: [], incomplete: [] },
			notAutomated: [],
		},
		resultFile: 'projects/shop/accessibility/app.json',
		views: [{ state: 'Home', results: views, evidence: 'projects/shop/accessibility/app/home/cells.json' }],
		source: [],
		sourceFile: 'projects/shop/accessibility/app/source.json',
		target,
		depth: 'full',
	});

const RETURNED = `${returnedTemplate('shop')}| 2.4.7 | Home | Tab to Save | A visible focus ring | serious | focus.png | yes |
| 1.1.1 Non-text Content | Home | Read the logo | Its name | minor | | yes |
| 1.4.10 | Devices | Zoom to 400% | No sideways scroll | serious | zoom.png | yes |
| 1.3.3 | Home | Read the help | Not "the green button" | minor | | no |
| 9.9.9 | Home | x | y | z | | yes |
| 2.4.7 | Home | too short |
`;

describe('what testers send back', () => {
	it('is read a row each, by its criterion’s number, and a row that is not a finding is said, never dropped', () => {
		const { findings, unreadable } = parseReturned(RETURNED);
		expect(findings.map((f) => f.sc)).toEqual(['2.4.7', '1.1.1', '1.4.10', '1.3.3']);
		expect(findings[0]).toMatchObject({
			where: 'Home',
			steps: 'Tab to Save',
			expected: 'A visible focus ring',
			severity: 'serious',
			evidence: 'focus.png',
			inWork: 'yes',
		});
		expect(unreadable).toEqual([
			{ line: 11, why: '"9.9.9" is not a WCAG A or AA criterion\'s number' },
			{ line: 12, why: 'it has 3 cells, and a finding has 7' },
		]);
		// The template alone is no finding.
		expect(parseReturned(returnedTemplate('shop'))).toEqual({ findings: [], unreadable: [] });
	});

	it('is sorted by what was measured of its criterion: missed by a machine, found by one too, not measured, or a person’s', () => {
		const l = ledger(
			[issue('image-alt', ['1.1.1'])],
			[cell('focus-visible', '2.4.7', 'none'), cell('reflow', '1.4.10', 'notRun', 'the time was used up')],
		);
		const kinds = sortReturned(parseReturned(RETURNED).findings, l).map((s) => [s.finding.sc, s.kind]);
		expect(kinds).toEqual([
			['2.4.7', 'escape'],
			['1.1.1', 'confirmed'],
			['1.4.10', 'unmeasured'],
			['1.3.3', 'person'],
		]);
	});
});

describe('the agent gap log', () => {
	const l = ledger([], [cell('focus-visible', '2.4.7', 'none')]);
	const escapes = sortReturned(parseReturned(RETURNED).findings, l).filter((s) => s.kind === 'escape');
	const LOG =
		'# Agent gap log: Shop\n\nOne row each.\n\n## Log\n\n| Date | What it got wrong | Category | Would fix it |\n|---|---|---|---|\n| 2026-09-02 | An earlier one | missing context | Fixed |\n\n## Component gaps\n\n| Date | x |\n|---|---|\n';

	it('gets each escape once, after the Log table’s last row, saying what DSNR missed and what would catch it next time', () => {
		// 2.4.7, which the probe measured, and 1.1.1, which axe did: both found nothing, and a tester found each.
		expect(escapes.map((e) => e.finding.sc)).toEqual(['2.4.7', '1.1.1']);
		const { text, added } = withGaps(LOG, 'Shop', escapes, '2026-10-17');
		expect(added).toBe(2);
		const lines = text.split('\n');
		const row = lines.findIndex((x) => x.includes('found by a tester'));
		expect(lines[row - 1]).toContain('An earlier one');
		expect(lines[row]).toMatch(
			/^\| 2026-10-17 \| \*\*Accessibility: WCAG 2\.4\.7 Focus Visible, found by a tester in Home and not by DSNR\*\* \(probe focus-visible \(measured\)\)\. Tab to Save; expected: A visible focus ring\./,
		);
		expect(lines[row]).toMatch(/\| missing runtime support \| A fixture of this fault, and a change to what measures 2\.4\.7 in DSNR/);
		expect(text).toContain('## Component gaps');
		// Read again: nothing logged twice.
		expect(withGaps(text, 'Shop', escapes, '2026-10-18')).toEqual({ text, added: 0 });
	});

	it('is started when the product has none', () => {
		const { text, added } = withGaps(null, 'Shop', escapes, '2026-10-17');
		expect(added).toBe(2);
		expect(text).toMatch(
			/^# Agent gap log: Shop\n[\s\S]*## Log\n\n\| Date \| What it got wrong \| Category \| Would fix it \|\n\|---\|---\|---\|---\|\n\| 2026-10-17 \|/,
		);
	});
});

describe('a guard for what was fixed', () => {
	const fixed = [
		// What measured it and found nothing gets no guard: only what found the fault does.
		{
			sc: '1.1.1',
			by: [
				{ layer: 'axe' as const, what: 'image-alt', where: 'Home', status: 'found' as const },
				{ layer: 'probe' as const, what: 'keyboard-reach', where: 'Home', status: 'measured' as const },
			],
		},
		{ sc: '1.4.3', by: [{ layer: 'axe' as const, what: 'color-contrast', where: 'Home', status: 'found' as const }] },
	];

	it('is the rule the product’s own lint has for it, proposed; and where it has none, what keeps it instead', () => {
		const lines = guardLines(guardsFor(fixed, [{ stack: 'biome', says: 'Biome (its a11y rules)' }]));
		expect(lines).toEqual([
			"- WCAG 1.1.1, image-alt: add `a11y/useAltText` (Biome (its a11y rules)) to the product's lint, so it is caught as code is written.",
			"- WCAG 1.4.3, color-contrast: no rule in Biome (its a11y rules) catches color-contrast in source: the product's own accessibility command keeps it.",
		]);
		expect(guardLines(guardsFor(fixed.slice(0, 1), []))[0]).toMatch(/DSNR knows no lint with accessibility rules in this product/);
	});

	it('reads the product’s stack from its own files', () => {
		const dir = mkdtempSync(join(tmpdir(), 'fdw-stack-'));
		try {
			expect(stacksOf(dir)).toEqual([]);
			writeFileSync(
				join(dir, 'package.json'),
				JSON.stringify({ dependencies: { react: '18' }, devDependencies: { eslint: '9', '@biomejs/biome': '1' } }),
			);
			expect(stacksOf(dir).map((s) => s.stack)).toEqual(['biome', 'eslint-jsx-a11y']);
			writeFileSync(join(dir, 'package.json'), JSON.stringify({ devDependencies: { eslint: '9' } }));
			writeFileSync(join(dir, 'biome.json'), '{}');
			expect(stacksOf(dir).map((s) => s.stack)).toEqual(['biome']);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
