/**
 * `review.md`'s section is written from the ledger, so the record people read and the one a gate checks are one. Never a
 * pass: a criterion is at most measured, with none found.
 */
import axe from 'axe-core';
import { criterionOf, whereFound } from '../../../shared/accessibility';
import type { AccessibilityResult } from '../../../shared/contract';
import { type DeclaredTarget, requiredAt, targetLine } from '../../../shared/wcag';
import { CRITERIA, type ManualMark } from '../../../shared/wcagCriteria';
import { plural } from '../../../shared/plural';
import { CELLS, type CellResult } from './probe/cells';

/**
 * Strongest first: `notRun`, a layer that could measure it did not; `measured`, none found of what each layer measures;
 * `notApplicable`, the page has nothing a layer measures; `person`, no layer reaches it.
 */
export type LedgerStatus = 'found' | 'notRun' | 'measured' | 'notApplicable' | 'person';

export interface LedgerPart {
	layer: 'axe' | 'probe';
	/** Axe's rule, or `axe` when none of its rules found anything; or a probe cell. */
	what: string;
	/** The states axe found it in, or a probe cell's view, or `the source`. */
	where: string;
	status: Exclude<LedgerStatus, 'person'>;
}

export interface LedgerRow {
	sc: string;
	name: string;
	/** One the target does not ask for is readiness, never counted as the target's. */
	atTarget: boolean;
	status: LedgerStatus;
	by: LedgerPart[];
	found: string[];
	/** From the design repository's root. */
	evidence: string[];
	/** Why it was not run, or does not apply; or, found, why it was left as it is. */
	why?: string;
	person: string | null;
	manual: ManualMark | null;
}

export const layersOf = (r: Pick<LedgerRow, 'by'>): ('axe' | 'probe')[] => [...new Set(r.by.map((p) => p.layer))];

export interface LedgerRun {
	command: string;
	address: string;
	pages: { name: string; path: string }[];
	data: string;
	assistiveTechnology: string[] | null;
}

/** Raise when what a ledger holds changes, so one an older DSNR wrote is measured again, never misread. */
export const LEDGER_VERSION = 2;

export interface Ledger {
	version: typeof LEDGER_VERSION;
	/** A prototype's name, or `app`. */
	key: string;
	of: string;
	at: string;
	target: string;
	axe: string;
	depth: string;
	run?: LedgerRun;
	/** Never a criterion's. */
	bestPractice: { rule: string; line: string }[];
	rows: LedgerRow[];
}

interface LedgerView {
	state: string;
	results: CellResult[];
	evidence: string;
}

const axeReaches = (tags: string[]): Set<string> =>
	new Set(
		axe
			.getRules(tags)
			.flatMap((r) => r.tags)
			.map(criterionOf)
			.filter((sc): sc is string => sc !== null),
	);

const STRONGEST: LedgerStatus[] = ['found', 'notRun', 'measured', 'notApplicable', 'person'];

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
	left,
	run,
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
	/** Said on each found row. */
	left?: string;
	run?: LedgerRun;
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
		const by: LedgerPart[] = [];
		const undecided: string[] = [];
		const notMeasured: string[] = [];
		if (byAxe.has(c.sc)) {
			evidence.add(resultFile);
			const issues = result.violations.filter((i) => i.criteria.includes(c.sc));
			found.push(...issues.map((i) => `axe ${i.rule}: ${whereFound(i)}`));
			statuses.push(issues.length ? 'found' : 'measured');
			by.push(
				...(issues.length
					? issues.map((i): LedgerPart => ({ layer: 'axe', what: i.rule, where: i.states.join(', '), status: 'found' }))
					: [{ layer: 'axe' as const, what: 'axe', where: result.ran.states.join(', '), status: 'measured' as const }]),
			);
			undecided.push(...result.incomplete.filter((i) => i.criteria.includes(c.sc)).map((i) => i.rule));
		}
		const own = cells.filter(({ r }) => r.sc === c.sc);
		// A cell not run in this measure (a light one) is said as not run, never "a person's" or "measured" in its place.
		const missing = CELLS.filter((cell) => cell.sc === c.sc && !own.some(({ r }) => r.cell === cell.id));
		for (const cell of missing) {
			by.push({ layer: 'probe', what: cell.id, where: cell.kind === 'source' ? 'the source' : 'every page', status: 'notRun' });
			statuses.push('notRun');
			notMeasured.push(`${cell.id} was not run in this measure (at ${depth} depth)`);
		}
		for (const { r, where, file } of own) {
			if (r.status === 'found') found.push(`probe ${r.cell}, in ${where}: ${plural(r.findings.length, 'finding')}`);
			if (r.status === 'notRun' || r.status === 'notApplicable') why.push(`${r.cell}, in ${where}: ${r.why ?? ''}`);
			if (r.status !== 'notRun') evidence.add(file);
			const status = r.status === 'none' ? 'measured' : r.status;
			statuses.push(status);
			by.push({ layer: 'probe', what: r.cell, where, status });
		}
		const status = statuses.length ? (STRONGEST.find((s) => statuses.includes(s)) as LedgerStatus) : 'person';
		const person = [c.person, undecided.length ? `what axe flagged to review (${undecided.join(', ')})` : null].filter(Boolean).join('; ') || null;
		return {
			sc: c.sc,
			name: c.name,
			atTarget: requiredAt(c, target.target),
			status,
			by,
			found,
			evidence: status === 'person' ? [] : [...evidence],
			...((why.length || notMeasured.length) && (status === 'notRun' || status === 'notApplicable')
				? { why: [...why, ...notMeasured].join('; ') }
				: {}),
			...(left && status === 'found' ? { why: left } : {}),
			person,
			manual: c.manual,
		};
	});
	const bestPractice = result.bestPractice.violations.map((i) => ({ rule: i.rule, line: `${i.rule}: ${whereFound(i)}` }));
	return {
		version: LEDGER_VERSION,
		key,
		of,
		at: result.ran.at,
		target: targetLine(target),
		axe: result.ran.axe,
		depth,
		...(run ? { run } : {}),
		bestPractice,
		rows,
	};
};

/**
 * A test holds the names to `standards/universal/accessibility.md`. Each stays a person's: what machines measured is
 * beside it, never in its place.
 */
export const TEN_CHECKS: { name: string; sc: string[]; bestPractice?: string[] }[] = [
	{ name: 'Keyboard reachability', sc: ['2.1.1'] },
	{ name: 'Tab order', sc: ['2.4.3', '2.1.2'] },
	{ name: 'Focus visibility', sc: ['2.4.7', '2.4.11'] },
	{ name: 'Focus management', sc: [] },
	{ name: 'Accessible names', sc: ['4.1.2', '1.1.1', '2.5.3'] },
	{ name: 'Heading structure', sc: ['1.3.1', '2.4.6'], bestPractice: ['heading-order', 'empty-heading', 'page-has-heading-one'] },
	{ name: 'Status announcement', sc: ['4.1.3'] },
	{ name: 'Non-color signals', sc: ['1.4.1'] },
	{ name: 'Error messages', sc: ['3.3.1', '3.3.3'] },
	{ name: 'Reduced motion', sc: [] },
];

/** A "not run" always says because. */
export const statusLine = (r: LedgerRow): string => {
	if (r.status === 'found') return `found (${r.found.join('; ')})${r.why ? `, left because ${r.why}` : ''}`;
	if (r.status === 'notRun') return `not run, because ${r.why ?? 'it was not run'}`;
	if (r.status === 'measured') return `measured, none found by ${layersOf(r).join(' and ')}`;
	if (r.status === 'notApplicable') return `does not apply, because ${r.why ?? 'there is nothing here to measure'}`;
	return 'left to check by hand';
};

/** Between these, so nothing anyone else wrote in `review.md` is touched. */
const opening = (key: string) => `<!-- dsnr:accessibility ${key} -->`;
const closing = (key: string) => `<!-- /dsnr:accessibility ${key} -->`;

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
		`Measured ${ledger.at.slice(0, 10)} with axe-core ${ledger.axe} at ${ledger.target}, and the probe at ${ledger.depth} depth, by \`dsnr accessibility\`. Written from \`${ledgerFile}\`: run it again rather than editing this. Automated checks are never a pass: each "measured" says only that none was found of what was measured. Each check is still a person's to make, with the last column what is left of it; the reviews record its outcome, and why when it was not run.`,
		'',
		'| # | Check | Measured | A person checks |',
		'|---|---|---|---|',
		...TEN_CHECKS.map((c, i) => {
			const rows = c.sc.map(sc);
			const practice = ledger.bestPractice.filter((b) => c.bestPractice?.includes(b.rule)).map((b) => `best practice, beside WCAG: ${b.line}`);
			const measured = [...rows.map(cell), ...practice].join('<br>') || 'No machine measures it here';
			const person =
				rows
					.map((r) => r.person)
					.filter(Boolean)
					.join('; ') || 'the whole check';
			return `| ${i + 1} | ${c.name} | ${measured} | ${person} |`;
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

export const withReviewSection = (review: string | null, ledger: Ledger, ledgerFile: string): string =>
	withMarked(review, opening(ledger.key), closing(ledger.key), reviewSection(ledger, ledgerFile));

/** `section` must start and end with its markers. Nothing else in the file changes. */
export const withMarked = (text: string | null, open: string, close: string, section: string): string => {
	const was = text ?? '';
	const [start, end] = [was.indexOf(open), was.indexOf(close)];
	if (start >= 0 && end > start) return `${was.slice(0, start)}${section}${was.slice(end + close.length)}`;
	return `${was.trimEnd()}${was.trim() ? '\n\n' : ''}${section}\n`;
};

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

/** A criterion found once and not measured now (a light run after a full one) has changed, and is not said to be fixed. */
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
		noLongerFound: changed.filter((c) => c.from === 'found' && c.to === 'measured').map((c) => c.sc),
		changed,
	};
};
