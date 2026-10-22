// A finding a machine measured and found nothing in is an **escape**, logged once in the product's `agent-gaps.md`.
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { CRITERIA } from '../../../shared/wcagCriteria';
import { type Ledger, type LedgerRow, layersOf } from './ledger';

export const agentGapsFile = (contextDir: string): string => join(contextDir, 'knowledge', 'agent-gaps.md');

export const RETURNED_COLUMNS = [
	'Criterion',
	'Page or state',
	'Steps to reproduce',
	'What was expected',
	'Severity',
	'Evidence',
	'In this work',
] as const;

export const returnedTemplate = (prototype: string): string =>
	[
		`# Accessibility findings returned for ${prototype}`,
		'',
		'Found by testing by hand: one row each, under the header. `dsnr accessibility` reads them, so nobody retypes them: what a machine could have caught becomes a check, so it is caught next time. The criterion is its number (`2.4.7`).',
		'',
		`| ${RETURNED_COLUMNS.join(' | ')} |`,
		`|${RETURNED_COLUMNS.map(() => '---').join('|')}|`,
		'',
	].join('\n');

export interface Returned {
	line: number;
	sc: string;
	where: string;
	steps: string;
	expected: string;
	severity: string;
	evidence: string;
	inWork: string;
	/** From its criterion, where and how it was found, so the same finding is read once even when another cell is corrected. */
	id: string;
}

export const parseReturned = (markdown: string): { findings: Returned[]; unreadable: { line: number; why: string }[] } => {
	const findings: Returned[] = [];
	const unreadable: { line: number; why: string }[] = [];
	markdown.split('\n').forEach((text, i) => {
		if (!/^\s*\|/.test(text) || /^\s*\|\s*-/.test(text) || /^\s*\|\s*Criterion\s*\|/.test(text)) return;
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

export type ReturnedKind = 'escape' | 'confirmed' | 'unmeasured' | 'person';

export const sortReturned = (findings: Returned[], ledger: Ledger): { finding: Returned; kind: ReturnedKind; row: LedgerRow }[] =>
	findings.map((finding) => {
		const row = ledger.rows.find((r) => r.sc === finding.sc) as LedgerRow;
		const kind: ReturnedKind =
			row.status === 'found' ? 'confirmed' : row.status === 'notRun' ? 'unmeasured' : row.status === 'person' ? 'person' : 'escape';
		return { finding, kind, row };
	});

const gapRow = ({ finding, row }: { finding: Returned; row: LedgerRow }, date: string): string => {
	const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
	const measured =
		row.by.map((p) => `${p.layer === 'axe' ? `axe ${p.what === 'axe' ? '' : p.what}`.trim() : `probe ${p.what}`} (${p.status})`).join(', ') ||
		layersOf(row).join(', ');
	return `| ${date} | **Accessibility: WCAG ${row.sc} ${row.name}, found by a tester in ${cell(finding.where)} and not by DSNR** (${measured}). ${cell(finding.steps)}; expected: ${cell(finding.expected)}. Severity ${cell(finding.severity)}; evidence: ${cell(finding.evidence)}. <!-- returned ${finding.id} --> | missing runtime support | A fixture of this fault, and a change to what measures ${row.sc} in DSNR, so it is caught next time (accessibility plan A9) |`;
};

const GAPS_TEMPLATE = (product: string) =>
	`# Agent gap log: ${product}\n\nWhat DSNR got wrong in ${product}, one row each.\n\n## Log\n\n| Date | What it got wrong | Category | Would fix it |\n|---|---|---|---|\n`;

/** Each row carries the finding's id, so one is logged once however often the file is read. */
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
