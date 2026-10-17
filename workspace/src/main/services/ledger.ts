/**
 * The accessibility ledger (A5 of the accessibility plan): one record per `dsnr accessibility` run, a row for each WCAG A
 * and AA criterion, saying which layers reached it (axe, the probe), its status, the evidence file each status rests on,
 * and what a person still judges of it. The accessibility section of a project's `review.md` is written from it, as the
 * standard's ten checks (each a view of its criteria), so the record people read and the record a gate checks are one.
 * Two ledgers are compared by their rows, so a quarter's change is a diff. Never a pass: a criterion is at most measured,
 * with none found of what was measured.
 */
import axe from 'axe-core';
import { criterionOf } from '../../shared/accessibility';
import type { AccessibilityResult } from '../../shared/contract';
import { type DeclaredTarget, requiredAt, targetLine } from '../../shared/wcag';
import { CRITERIA } from '../../shared/wcagCriteria';
import type { CellResult } from './probe/cells';

/**
 * A criterion's status, strongest first: `found` by a layer; `notRun`, a layer that could measure it did not (with why);
 * `measured` by every layer that reached it, with none found of what each measures; `notApplicable`, the page has nothing
 * a layer measures; `person`, no layer reaches it, and only a person can check it.
 */
export type LedgerStatus = 'found' | 'notRun' | 'measured' | 'notApplicable' | 'person';

export interface LedgerRow {
	sc: string;
	name: string;
	/** Whether the product's target asks for it; one it does not is readiness, never counted as the target's. */
	atTarget: boolean;
	status: LedgerStatus;
	layers: ('axe' | 'probe')[];
	/** What was found, a line each: the rule or cell, where, and how much. */
	found: string[];
	/** The evidence files the status rests on, from the design repository's root. */
	evidence: string[];
	/** Why it was not run, or does not apply. */
	why?: string;
	/** What a person still judges of it, whatever a machine found. */
	person: string | null;
	/** When the manual list carries it (AT, if, host). */
	manual: string | null;
}

export interface Ledger {
	version: 1;
	/** Which measure of the project it is (a prototype's name, or `app`), and what that is, in words. */
	key: string;
	of: string;
	at: string;
	target: string;
	axe: string;
	depth: string;
	rows: LedgerRow[];
}

/** One view the probe measured: its name, what each cell found, and the file its results are in. */
export interface LedgerView {
	state: string;
	results: CellResult[];
	evidence: string;
}

/** The criteria axe has a rule for, among the tags a run used. */
const axeReaches = (tags: string[]): Set<string> =>
	new Set(
		axe
			.getRules(tags)
			.flatMap((r) => r.tags)
			.map(criterionOf)
			.filter((sc): sc is string => sc !== null),
	);

const STRONGEST: LedgerStatus[] = ['found', 'notRun', 'measured', 'notApplicable', 'person'];

/** The ledger of one run: each criterion from what axe found (`result`) and what the probe found in each view and the source. */
export const ledgerOf = ({
	key,
	of,
	result,
	resultFile,
	views,
	source,
	sourceFile,
	target,
	depth,
}: {
	key: string;
	of: string;
	result: AccessibilityResult;
	resultFile: string;
	views: LedgerView[];
	source: CellResult[];
	sourceFile: string;
	target: DeclaredTarget;
	depth: string;
}): Ledger => {
	const byAxe = axeReaches(result.ran.tags);
	const cells = [
		...views.flatMap((v) => v.results.map((r) => ({ r, where: v.state, file: v.evidence }))),
		...source.map((r) => ({ r, where: 'the source', file: sourceFile })),
	];
	const rows = CRITERIA.map((c): LedgerRow => {
		const statuses: LedgerStatus[] = [];
		const found: string[] = [];
		const evidence = new Set<string>();
		const why: string[] = [];
		const layers: LedgerRow['layers'] = [];
		const undecided: string[] = [];
		if (byAxe.has(c.sc)) {
			layers.push('axe');
			evidence.add(resultFile);
			const issues = result.violations.filter((i) => i.criteria.includes(c.sc));
			found.push(
				...issues.map(
					(i) =>
						`axe ${i.rule}: ${i.nodes} element${i.nodes === 1 ? '' : 's'}${i.states.join(', ') === 'default' ? '' : `, in ${i.states.join(', ')}`}`,
				),
			);
			statuses.push(issues.length ? 'found' : 'measured');
			undecided.push(...result.incomplete.filter((i) => i.criteria.includes(c.sc)).map((i) => i.rule));
		}
		const own = cells.filter(({ r }) => r.sc === c.sc);
		if (own.length) layers.push('probe');
		for (const { r, where, file } of own) {
			if (r.status === 'found') found.push(`probe ${r.cell}, in ${where}: ${r.findings.length} finding${r.findings.length === 1 ? '' : 's'}`);
			if (r.status === 'notRun' || r.status === 'notApplicable') why.push(`${r.cell}, in ${where}: ${r.why ?? ''}`);
			if (r.status !== 'notRun') evidence.add(file);
			statuses.push(r.status === 'none' ? 'measured' : r.status);
		}
		const status = statuses.length ? (STRONGEST.find((s) => statuses.includes(s)) as LedgerStatus) : 'person';
		const person = [c.person, undecided.length ? `what axe could not decide (${undecided.join(', ')})` : null].filter(Boolean).join('; ') || null;
		return {
			sc: c.sc,
			name: c.name,
			atTarget: requiredAt(c, target.target),
			status,
			layers,
			found,
			evidence: status === 'person' ? [] : [...evidence],
			...(why.length && (status === 'notRun' || status === 'notApplicable') ? { why: why.join('; ') } : {}),
			person,
			manual: c.manual,
		};
	});
	return { version: 1, key, of, at: result.ran.at, target: targetLine(target), axe: result.ran.axe, depth, rows };
};

/**
 * The standard's ten manual checks, each a view of the criteria it is about: the names people know, kept as they are in
 * `standards/universal/accessibility.md` (a test holds them to it), so the review record reads as it always has.
 */
export const TEN_CHECKS: { name: string; sc: string[] }[] = [
	{ name: 'Keyboard reachability', sc: ['2.1.1'] },
	{ name: 'Tab order', sc: ['2.4.3', '2.1.2'] },
	{ name: 'Focus visibility', sc: ['2.4.7', '2.4.11'] },
	{ name: 'Focus management', sc: ['3.2.1'] },
	{ name: 'Accessible names', sc: ['4.1.2', '1.1.1', '2.5.3'] },
	{ name: 'Heading structure', sc: ['1.3.1', '2.4.6'] },
	{ name: 'Status announcement', sc: ['4.1.3'] },
	{ name: 'Non-color signals', sc: ['1.4.1'] },
	{ name: 'Error messages', sc: ['3.3.1', '3.3.3'] },
	{ name: 'Reduced motion', sc: ['2.2.2', '2.3.1'] },
];

/** A row's status in words, the same in the review record and wherever else it is said. A "not run" always says because. */
export const statusLine = (r: LedgerRow): string => {
	if (r.status === 'found') return `found (${r.found.join('; ')})`;
	if (r.status === 'notRun') return `not run, because ${r.why ?? 'it was not run'}`;
	if (r.status === 'measured') return `measured, none found by ${r.layers.join(' and ')}`;
	if (r.status === 'notApplicable') return `does not apply, because ${r.why ?? 'there is nothing here to measure'}`;
	return 'a person’s to check: no automated measure reaches it';
};

/** Where `dsnr` writes a run's section in `review.md`, between these, so nothing anyone else wrote there is touched. */
const opening = (key: string) => `<!-- dsnr:accessibility ${key} -->`;
const closing = (key: string) => `<!-- /dsnr:accessibility ${key} -->`;

/** The accessibility section of `review.md`, written from the ledger: the ten checks, then what else was found, what was not run, and what is above the target. */
export const reviewSection = (ledger: Ledger, ledgerFile: string): string => {
	const at = ledger.rows.filter((r) => r.atTarget);
	const sc = (n: string) => ledger.rows.find((r) => r.sc === n) as LedgerRow;
	const inChecks = new Set(TEN_CHECKS.flatMap((c) => c.sc));
	const cell = (r: LedgerRow) => `${r.sc} ${r.name}${r.atTarget ? '' : ' (above the target)'}: ${statusLine(r)}`;
	const lines = (rows: LedgerRow[]) => rows.map((r) => `- ${cell(r)}`);
	const outside = at.filter((r) => !inChecks.has(r.sc));
	return [
		opening(ledger.key),
		`## Accessibility: ${ledger.of}`,
		'',
		`Measured ${ledger.at.slice(0, 10)} with axe-core ${ledger.axe} at ${ledger.target}, and the probe at ${ledger.depth} depth, by \`dsnr accessibility\`. Written from \`${ledgerFile}\`: run it again rather than editing this. Automated checks are never a pass: each "measured" says only that none was found of what was measured, and the last column is a person's.`,
		'',
		'| # | Check | Measured | A person checks |',
		'|---|---|---|---|',
		...TEN_CHECKS.map((c, i) => {
			const rows = c.sc.map(sc);
			const person =
				rows
					.map((r) => r.person)
					.filter(Boolean)
					.join('; ') || '—';
			return `| ${i + 1} | ${c.name} | ${rows.map(cell).join('<br>')} | ${person} |`;
		}),
		'',
		'### The other criteria at the target',
		'',
		...lines(outside.filter((r) => r.status === 'found' || r.status === 'notRun')),
		`- Measured, none found: ${
			outside
				.filter((r) => r.status === 'measured')
				.map((r) => r.sc)
				.join(', ') || 'none'
		}.`,
		`- Does not apply here: ${
			outside
				.filter((r) => r.status === 'notApplicable')
				.map((r) => r.sc)
				.join(', ') || 'none'
		}.`,
		`- A person's alone (no automated measure reaches them): ${
			outside
				.filter((r) => r.status === 'person')
				.map((r) => r.sc)
				.join(', ') || 'none'
		}.`,
		'',
		`Above the target (readiness, not counted as it): ${
			ledger.rows
				.filter((r) => !r.atTarget && r.status === 'found')
				.map((r) => r.sc)
				.join(', ') || 'nothing'
		} found.`,
		closing(ledger.key),
	].join('\n');
};

/** `review.md` with this run's section put in place of its last one, or added at its end; nothing else in it changes. */
export const withReviewSection = (review: string | null, ledger: Ledger, ledgerFile: string): string => {
	const section = reviewSection(ledger, ledgerFile);
	const text = review ?? '';
	const [start, end] = [text.indexOf(opening(ledger.key)), text.indexOf(closing(ledger.key))];
	if (start >= 0 && end > start) return `${text.slice(0, start)}${section}${text.slice(end + closing(ledger.key).length)}`;
	return `${text.trimEnd()}${text.trim() ? '\n\n' : ''}${section}\n`;
};

/**
 * What a gate refuses in a ledger: a status resting on no evidence file, or on one that is not there; a "not run" or a
 * "does not apply" with no reason; and a review record whose section is not the one this ledger writes. Empty when none.
 */
export const ledgerFaults = (ledger: Ledger, ledgerFile: string, exists: (path: string) => boolean, review: string | null): string[] => [
	...ledger.rows.flatMap((r) => {
		const faults: string[] = [];
		if (r.status !== 'person' && r.status !== 'notRun' && r.evidence.length === 0) faults.push(`WCAG ${r.sc} is ${r.status} with no evidence file`);
		faults.push(...r.evidence.filter((e) => !exists(e)).map((e) => `WCAG ${r.sc} rests on ${e}, which is not there`));
		if ((r.status === 'notRun' || r.status === 'notApplicable') && !r.why?.trim()) faults.push(`WCAG ${r.sc} is ${r.status} with no reason`);
		return faults;
	}),
	...(review?.includes(reviewSection(ledger, ledgerFile))
		? []
		: [
				`review.md's accessibility section for ${ledger.of} is not the one its ledger writes: run dsnr accessibility again, and do not edit that section by hand`,
			]),
];

/** How one run's ledger differs from the last: what is newly found, what is no longer found, and every other change of status. */
export const ledgerChanges = (
	before: Ledger,
	after: Ledger,
): { newlyFound: string[]; noLongerFound: string[]; changed: { sc: string; from: LedgerStatus; to: LedgerStatus }[] } => {
	const was = new Map(before.rows.map((r) => [r.sc, r.status]));
	const changed = after.rows.flatMap((r) => {
		const from = was.get(r.sc);
		return from && from !== r.status ? [{ sc: r.sc, from, to: r.status }] : [];
	});
	return {
		newlyFound: changed.filter((c) => c.to === 'found').map((c) => c.sc),
		noLongerFound: changed.filter((c) => c.from === 'found').map((c) => c.sc),
		changed,
	};
};
