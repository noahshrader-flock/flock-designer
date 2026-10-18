import { describe, expect, it } from 'vitest';
import { CELLS, type CellId, MOST_FINDINGS, cellsAt, resultFrom } from '../src/core/services/accessibility/probe/cells';
import { PATTERNS, scanSources } from '../src/core/services/accessibility/probe/sourceScan';
import { CRITERIA, atTarget, wcagCriterion } from '../src/shared/wcagCriteria';
import { SOURCE_FIXTURES } from './fixtures/probeFixtures';

/**
 * The probe's cells (A3 of the accessibility plan): one for each criterion its matrix says the probe measures, held to
 * WCAG's own list, and the source cells, each against its planted defect and clean twin.
 */

/** The matrix's "Probe measures" column: the criteria a probe cell measures. */
const PROBE_COLUMN = [
	'1.3.1',
	'1.3.2',
	'1.3.4',
	'1.4.1',
	'1.4.3',
	'1.4.4',
	'1.4.10',
	'1.4.11',
	'1.4.12',
	'1.4.13',
	'2.1.1',
	'2.1.2',
	'2.1.4',
	'2.2.1',
	'2.2.2',
	'2.3.1',
	'2.4.3',
	'2.4.7',
	'2.4.11',
	'2.5.1',
	'2.5.2',
	'2.5.4',
	'2.5.7',
	'2.5.8',
	'3.2.1',
	'3.2.2',
	'3.3.1',
	'4.1.2',
	'4.1.3',
];

describe('the cells', () => {
	it('measure every criterion of the matrix’s probe column, and only those, each one of WCAG 2.2’s A and AA', () => {
		expect([...new Set(CELLS.map((c) => c.sc))].sort()).toEqual([...PROBE_COLUMN].sort());
		for (const c of CELLS) expect(wcagCriterion(c.sc).sc).toBe(c.sc);
		expect(CRITERIA).toHaveLength(55);
		expect(() => wcagCriterion('4.1.1')).toThrow(/not a Level A or AA criterion of WCAG 2.2/);
	});

	it('say whether a target asks for each: at WCAG 2.0 A, contrast is above it; at 2.1 AA, reflow is in it and target size is not', () => {
		expect(atTarget('1.4.3', { version: '2.0', level: 'A' })).toBe(false);
		expect(atTarget('2.1.1', { version: '2.0', level: 'A' })).toBe(true);
		expect(atTarget('1.4.10', { version: '2.1', level: 'AA' })).toBe(true);
		expect(atTarget('2.5.8', { version: '2.1', level: 'AA' })).toBe(false);
	});

	it('have a light subset of the tree and the Tab walk alone, and all of them at full depth', () => {
		expect(cellsAt('light').map((c) => c.id)).toEqual([
			'structure',
			'name-role-value',
			'keyboard-reach',
			'keyboard-trap',
			'focus-order',
			'focus-visible',
			'focus-obscured',
			'on-focus',
		]);
		expect(cellsAt('full')).toHaveLength(CELLS.length);
	});

	it('keep a cell’s first findings and count the rest', () => {
		const many = Array.from({ length: MOST_FINDINGS + 3 }, (_, i) => ({ target: `#a${i}`, detail: 'x' }));
		const r = resultFrom('structure', many);
		expect(r.findings).toHaveLength(MOST_FINDINGS + 1);
		expect(r.findings.at(-1)).toEqual({ target: '…', detail: 'and 3 more' });
		expect(resultFrom('structure', [])).toEqual({ cell: 'structure', sc: '1.3.1', status: 'none', findings: [] });
	});
});

describe('the source cells', () => {
	const sourceCells = CELLS.filter((c) => c.kind === 'source').map((c) => c.id as CellId);

	it('each have what they look for, and a fixture', () => {
		expect(sourceCells.filter((c) => !PATTERNS[c] || !SOURCE_FIXTURES[c])).toEqual([]);
		expect(Object.keys(PATTERNS).sort()).toEqual([...sourceCells].sort());
	});

	const lines = sourceCells.flatMap((cell) => {
		const { bad, good } = SOURCE_FIXTURES[cell] as { bad: string[]; good: string[] };
		return [...bad.map((text) => ({ cell, text, found: true })), ...good.map((text) => ({ cell, text, found: false }))];
	});
	it.each(lines)('$cell: in “$text”, found: $found', ({ cell, text, found }) => {
		const [result] = scanSources([cell], [{ path: 'src/View.tsx', text: `// before\n${text}` }]);
		if (!found) return expect(result).toEqual({ cell, sc: expect.any(String), status: 'none', findings: [] });
		// By file and line: the line it is on, after the one before it.
		expect(result).toMatchObject({ cell, status: 'found', findings: [{ target: expect.stringMatching(/^src\/View\.tsx:\d+$/) }] });
		// The line it names is the line it quotes, counted from the file's first (a line is put before the fixture).
		const at = text.split('\n').findIndex((l) => l.trim() === result?.findings[0]?.detail);
		expect(result?.findings[0]?.target).toBe(`src/View.tsx:${at + 2}`);
	});

	it('are not run when the work has no files of its own: reading nothing is never none found', () => {
		expect(scanSources(['timing'], [])).toEqual([
			{ cell: 'timing', sc: '2.2.1', status: 'notRun', findings: [], why: 'the work has no files of its own to read' },
		]);
	});

	it('are not run, with why, when there is no source to read, and leave the page’s cells to the page', () => {
		expect(scanSources(['timing', 'structure'], null, 'this checkout has no base to compare with')).toEqual([
			{ cell: 'timing', sc: '2.2.1', status: 'notRun', findings: [], why: 'this checkout has no base to compare with' },
		]);
	});
});
