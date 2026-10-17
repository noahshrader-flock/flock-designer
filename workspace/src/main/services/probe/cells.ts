import { wcagCriterion } from '../../../shared/wcagCriteria';

/**
 * The probe's cells (A3 of the accessibility plan): one per "Probe measures" entry of its matrix, each a measure that code
 * decides, of one WCAG criterion. What each measures is said once here, and every result is said in the same four words:
 * found, none found, does not apply, not run (with why). None of them is a pass: a measure that finds nothing has measured
 * only what it says it measures.
 */

/** Where a cell's measure is made: in the page, in the browser, or in the work's source. */
export type CellKind = 'page' | 'source';

export interface Cell {
	id: string;
	/** The WCAG criterion it measures (`wcagCriteria.ts`). */
	sc: string;
	/** What it measures, as a person reads it. */
	measures: string;
	/** In the light subset, run at every build: axe, the accessibility tree and the Tab walk. */
	light: boolean;
	kind: CellKind;
}

const page = (id: string, sc: string, light: boolean, measures: string): Cell => ({ id, sc, measures, light, kind: 'page' });
const source = (id: string, sc: string, measures: string): Cell => ({ id, sc, measures, light: false, kind: 'source' });

export const CELLS = [
	page('structure', '1.3.1', true, 'text drawn as a heading that is not one, and tables of data with no header cell'),
	page('name-role-value', '4.1.2', true, 'controls in the accessibility tree with no name, and elements Tab reaches that have no role'),
	page('keyboard-reach', '2.1.1', true, 'what looks clickable and cannot be reached by Tab'),
	page('keyboard-trap', '2.1.2', true, 'a Tab walk that cannot leave a part of the page'),
	page('focus-order', '2.4.3', true, 'Tab going back up the page, and a positive tabindex'),
	page('focus-visible', '2.4.7', true, 'a Tab stop drawn the same focused as not'),
	page('focus-obscured', '2.4.11', true, 'a Tab stop wholly covered by something drawn over it'),
	page('on-focus', '3.2.1', true, 'focus alone opening a window or a dialog, going to another address, or replacing the page'),
	page('keyboard-operate', '2.1.1', false, 'a control written with a role that a click operates and Enter or Space does not'),
	page('reading-order', '1.3.2', false, 'text read after text it is drawn below'),
	page('orientation', '1.3.4', false, 'content shown in one orientation and not the other'),
	page('color-only', '1.4.1', false, 'marks drawn only by their color, which forced colors paints over'),
	page('contrast-states', '1.4.3', false, 'text contrast on focus and on hover (the page as it opens is axe’s)'),
	page('resize-text', '1.4.4', false, 'text cut off at 200% zoom'),
	page('reflow', '1.4.10', false, 'scrolling sideways, and text cut off, 320 pixels wide'),
	page('non-text-contrast', '1.4.11', false, 'field edges, icons and focus indicators under 3:1'),
	page('text-spacing', '1.4.12', false, 'text cut off with WCAG’s text spacing'),
	page(
		'hover-content',
		'1.4.13',
		false,
		'content shown on hover or focus that Escape does not dismiss, that goes when the pointer moves onto it, or that does not stay',
	),
	page('pause-stop-hide', '2.2.2', false, 'animations that play by themselves for more than five seconds'),
	page('target-size', '2.5.8', false, 'targets smaller than 24 by 24 pixels with another within reach'),
	page('on-input', '3.2.2', false, 'changing a control’s value opening a window or a dialog, going to another address, or replacing the page'),
	page(
		'error-identification',
		'3.3.1',
		false,
		'an error shown on sending a form that no field names, or a field marked invalid that names no message',
	),
	page('status-messages', '4.1.3', false, 'a short message added after a control is used, outside any live region'),
	source('key-shortcuts', '2.1.4', 'a single character key handled with no modifier key checked beside it'),
	source('timing', '2.2.1', 'timers of 20 seconds or more'),
	source('flashing', '2.3.1', 'animations repeated for ever, a third of a second or faster'),
	source('pointer-gestures', '2.5.1', 'handlers of several touches or of a path (touch moves, gestures)'),
	source('pointer-cancellation', '2.5.2', 'handlers on the down event of a pointer, a mouse or a touch'),
	source('motion-actuation', '2.5.4', 'handlers of the device’s motion or orientation'),
	source('dragging', '2.5.7', 'drag handlers, and elements that can be dragged'),
] as const satisfies readonly Cell[];

export type CellId = (typeof CELLS)[number]['id'];

export const cellOf = (id: CellId): Cell => CELLS.find((c) => c.id === id) as Cell;

/** Which cells a run measures: the light subset at a build, all of them at Handoff and in a remediation run. */
export type ProbeDepth = 'light' | 'full';
export const cellsAt = (depth: ProbeDepth): Cell[] => CELLS.filter((c) => depth === 'full' || c.light);

/**
 * What a cell measured: `found`, with each finding; `none` found, by what it measures; `notApplicable`, as the page has
 * nothing it measures (no form, no field), said; `notRun`, with why (the run's time cap, no source to read).
 */
export type CellStatus = 'found' | 'none' | 'notApplicable' | 'notRun';

/** One finding: where (a selector, or a file and line), and what was measured there. */
export interface ProbeFinding {
	target: string;
	detail: string;
}

export interface CellResult {
	cell: CellId;
	sc: string;
	status: CellStatus;
	findings: ProbeFinding[];
	/** Why it does not apply, or was not run. */
	why?: string;
}

/** The most findings a cell keeps: the rest are counted in the last. */
export const MOST_FINDINGS = 20;

/** A cell's result from what it found: `none` when nothing, else its first findings, the rest counted. */
export const resultFrom = (cell: CellId, findings: ProbeFinding[]): CellResult => {
	const sc = cellOf(cell).sc;
	if (findings.length === 0) return { cell, sc, status: 'none', findings: [] };
	const kept = findings.slice(0, MOST_FINDINGS);
	const more = findings.length - kept.length;
	return { cell, sc, status: 'found', findings: more > 0 ? [...kept, { target: '…', detail: `and ${more} more` }] : kept };
};

export const notApplicable = (cell: CellId, why: string): CellResult => ({ cell, sc: cellOf(cell).sc, status: 'notApplicable', findings: [], why });
export const notRun = (cell: CellId, why: string): CellResult => ({ cell, sc: cellOf(cell).sc, status: 'notRun', findings: [], why });

/** How many findings of a cell are printed: all of them are in the evidence. */
const MOST_PRINTED = 5;

/** A cell's result as the agent reads it: what it is, by WCAG, where (`where`), and its first findings. */
export const cellLines = (r: CellResult, where: string): string[] => {
	const c = wcagCriterion(r.sc);
	const head = `- **${r.cell}** (WCAG ${c.sc} ${c.name})${where}`;
	if (r.status !== 'found') return [`${head}: ${r.why ?? ''}`];
	return [
		`${head}:`,
		...r.findings.slice(0, MOST_PRINTED).map((f) => `  - \`${f.target}\`: ${f.detail}`),
		...(r.findings.length > MOST_PRINTED ? [`  - and ${r.findings.length - MOST_PRINTED} more, in the evidence`] : []),
	];
};
