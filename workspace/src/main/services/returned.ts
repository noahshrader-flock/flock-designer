/**
 * What testers send back (A9 of the accessibility plan): the findings a person makes by hand, one row each in the
 * project's `accessibility/returned.md` (the table the manual list gives), read without anyone retyping them. Each is
 * sorted by what was measured of its criterion, not by judgment: a criterion a machine measured and found nothing in is
 * an **escape** (a machine could have caught it), logged once in the product's `agent-gaps.md` so a fixture and a probe
 * change catch it next time; one a machine had found too is confirmed; one not measured this time says why; one no
 * machine reaches is a person's, as the manual list said. The goal's own measure is the count of escapes, which should
 * fall to none.
 */
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { CRITERIA } from '../../shared/wcagCriteria';
import { type Ledger, type LedgerRow, layersOf } from './ledger';

/** A product's agent gap log, in its context folder: what DSNR got wrong there, which the product keeps. */
export const agentGapsFile = (contextDir: string): string => join(contextDir, 'knowledge', 'agent-gaps.md');

/** The table the manual list asks findings to be returned in: its header, as the file starts. */
export const RETURNED_COLUMNS = [
	'Criterion',
	'Page or state',
	'Steps to reproduce',
	'What was expected',
	'Severity',
	'Evidence',
	'In this work',
] as const;

/** The file testers return findings in, as it starts: what it is for, and the table's header. */
export const returnedTemplate = (project: string): string =>
	[
		`# Accessibility findings returned for ${project}`,
		'',
		'Found by testing by hand: one row each, under the header. `dsnr accessibility` reads them, so nobody retypes them: what a machine could have caught becomes a check, so it is caught next time. The criterion is its number (`2.4.7`).',
		'',
		`| ${RETURNED_COLUMNS.join(' | ')} |`,
		`|${RETURNED_COLUMNS.map(() => '---').join('|')}|`,
		'',
	].join('\n');

export interface Returned {
	/** Its line in the file, to find it by. */
	line: number;
	sc: string;
	where: string;
	steps: string;
	expected: string;
	severity: string;
	evidence: string;
	inWork: string;
	/** What it is: its criterion, where and how it was found, so the same finding is read once however often the file is read, or a cell of it corrected. */
	id: string;
}

/** The rows of the returned table, and the lines that are rows but not readable as findings (no known criterion, too few cells). */
export const parseReturned = (markdown: string): { findings: Returned[]; unreadable: { line: number; why: string }[] } => {
	const findings: Returned[] = [];
	const unreadable: { line: number; why: string }[] = [];
	markdown.split('\n').forEach((text, i) => {
		if (!/^\s*\|/.test(text) || /^\s*\|\s*-/.test(text) || /^\s*\|\s*Criterion\s*\|/.test(text)) return;
		// Cells split where a `|` is not written `\|`: one in a cell's words stays in it.
		const cells = text
			.trim()
			.replace(/^\||(?<!\\)\|$/g, '')
			.split(/(?<!\\)\|/)
			.map((c) => c.trim().replace(/\\\|/g, '|'));
		if (cells.every((c) => c === '')) return;
		const sc = /\b(\d\.\d{1,2}\.\d{1,2})\b/.exec(cells[0] ?? '')?.[1];
		if (cells.length !== RETURNED_COLUMNS.length)
			return void unreadable.push({ line: i + 1, why: `it has ${cells.length} cells, and a finding has ${RETURNED_COLUMNS.length}` });
		if (!sc || !CRITERIA.some((c) => c.sc === sc))
			return void unreadable.push({ line: i + 1, why: `"${cells[0]}" is not a WCAG A or AA criterion's number` });
		const [, where, steps, expected, severity, evidence, inWork] = cells as [string, string, string, string, string, string, string];
		const said = (x: string) => x.toLowerCase().replace(/\s+/g, ' ').trim();
		const id = createHash('sha256')
			.update([sc, said(where), said(steps)].join('\u0000'))
			.digest('hex')
			.slice(0, 12);
		findings.push({ line: i + 1, sc, where, steps, expected, severity, evidence, inWork, id });
	});
	return { findings, unreadable };
};

/** How a returned finding stands against what was measured of its criterion. */
export type ReturnedKind = 'escape' | 'confirmed' | 'unmeasured' | 'person';

/** Each finding sorted by its criterion's row in the ledger: what a machine measured of it, and what it found. */
export const sortReturned = (findings: Returned[], ledger: Ledger): { finding: Returned; kind: ReturnedKind; row: LedgerRow }[] =>
	findings.map((finding) => {
		const row = ledger.rows.find((r) => r.sc === finding.sc) as LedgerRow;
		const kind: ReturnedKind =
			row.status === 'found' ? 'confirmed' : row.status === 'notRun' ? 'unmeasured' : row.status === 'person' ? 'person' : 'escape';
		return { finding, kind, row };
	});

/** An escape, as a row of the product's agent gap log: what DSNR missed, and what would make it catch it next time. */
const gapRow = ({ finding, row }: { finding: Returned; row: LedgerRow }, date: string): string => {
	const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
	const measured =
		row.by.map((p) => `${p.layer === 'axe' ? `axe ${p.what === 'axe' ? '' : p.what}`.trim() : `probe ${p.what}`} (${p.status})`).join(', ') ||
		layersOf(row).join(', ');
	return `| ${date} | **Accessibility: WCAG ${row.sc} ${row.name}, found by a tester in ${cell(finding.where)} and not by DSNR** (${measured}). ${cell(finding.steps)}; expected: ${cell(finding.expected)}. Severity ${cell(finding.severity)}; evidence: ${cell(finding.evidence)}. <!-- returned ${finding.id} --> | missing runtime support | A fixture of this fault, and a change to what measures ${row.sc} in DSNR, so it is caught next time (accessibility plan A9) |`;
};

/** The agent gap log as it starts, when a product has none yet. */
const GAPS_TEMPLATE = (product: string) =>
	`# Agent gap log: ${product}\n\nWhat DSNR got wrong in ${product}, one row each.\n\n## Log\n\n| Date | What it got wrong | Category | Would fix it |\n|---|---|---|---|\n`;

/**
 * The agent gap log with each escape not logged before added to its Log table (each carries the finding's id, so one is
 * logged once however often the file is read); a log that does not exist yet is started.
 */
export const withGaps = (
	log: string | null,
	product: string,
	rows: { finding: Returned; row: LedgerRow }[],
	date: string,
): { text: string; added: number } => {
	const text = log ?? GAPS_TEMPLATE(product);
	const fresh = rows.filter(({ finding }) => !text.includes(`<!-- returned ${finding.id} -->`));
	if (fresh.length === 0) return { text, added: 0 };
	const lines = text.split('\n');
	// After the Log table's last row: the next line after "## Log" that is not a table line, or the end.
	const at = lines.findIndex((l) => /^## Log\b/.test(l));
	let end = lines.length;
	if (at >= 0) {
		const tableStart = lines.findIndex((l, i) => i > at && /^\|/.test(l));
		end = tableStart < 0 ? at + 1 : lines.findIndex((l, i) => i > tableStart && !/^\|/.test(l));
		if (end < 0) end = lines.length;
	}
	lines.splice(end, 0, ...fresh.map((r) => gapRow(r, date)));
	return { text: lines.join('\n'), added: fresh.length };
};
