/**
 * The probe's source cells (A3): what a page cannot show, found in the work's own source by the names the web platform
 * gives it (DOM events and APIs, CSS). An event is found by its own name however a framework binds it (`onMouseDown`,
 * `@mousedown`, `v-on:mousedown`, `on:mousedown`, `(mousedown)`, `addEventListener('mousedown')`), so it reads the same in
 * any framework's files. A finding here is something to look at, not a fault: whether a shortcut can be turned off, or a
 * drag has another way, is a person's to judge (the manual list says so).
 */
import { type CellId, type CellResult, type ProbeFinding, notRun, resultFrom } from './cells';

export interface SourceFile {
	path: string;
	text: string;
}

/** How far either side of a line is read for what goes with it (a modifier key checked beside a key). */
const AROUND = 6;

/** A delay in milliseconds written on a line, as a number or a product of numbers (`20_000`, `60 * 1000`). */
const delays = (line: string): number[] =>
	[...line.matchAll(/\d[\d_]*(?:\s*\*\s*\d[\d_]*)*/g)].map((m) => m[0].split('*').reduce((n, part) => n * Number(part.replace(/_/g, '').trim()), 1));

/** A CSS time in milliseconds (`0.2s`, `150ms`). */
const times = (line: string): number[] => [...line.matchAll(/(\d*\.?\d+)(ms|s)\b/g)].map((m) => Number(m[1]) * (m[2] === 's' ? 1000 : 1));

/**
 * An event's own name, as any framework binds it, in any case: after something not a letter (`@`, `:`, `(`, a quote, a
 * space), with `on` before it or not (`mousedown`, `onMouseDown`, `@mousedown`, `on:mousedown`), and not inside a longer word.
 */
const event = (names: string) => new RegExp(`(?:^|[^a-z0-9])(?:on-?)?(?:${names})(?![a-z0-9])`, 'i');

/** What each source cell looks for, by line, with the lines around it. Every source cell has one (a test holds it). */
export const PATTERNS: Partial<Record<CellId, (line: string, around: string) => boolean>> = {
	'key-shortcuts': (line, around) =>
		(/\b(key|code)\s*===?\s*['"](?:Key)?[A-Za-z0-9?/.,;]['"]/.test(line) ||
			/['"][A-Za-z0-9?/]['"]\s*===?\s*\w+\.key\b/.test(line) ||
			// A template's key modifier: `@keydown.k`, `v-on:keyup.s`.
			/(?:@|v-on:)key(?:down|up|press)\.[a-z0-9](?![a-z0-9])/i.test(line)) &&
		!/\b(ctrlKey|metaKey|altKey)\b|\.(ctrl|meta|alt)\b/.test(around),
	timing: (line) => /\bset(Timeout|Interval)\s*\(/.test(line) && delays(line).some((ms) => ms >= 20_000),
	flashing: (line, around) =>
		/\banimation(-duration)?\s*:/.test(line) && /\binfinite\b/.test(around) && times(line).some((ms) => ms > 0 && ms <= 333),
	'pointer-gestures': (line) => /\btouches\.length\b/.test(line) || event('touch-?move|gesture(?:start|change|end)').test(line),
	'pointer-cancellation': (line) => event('(?:mouse|pointer)-?down|touch-?start').test(line),
	'motion-actuation': (line) => /\bdevice-?(motion|orientation)\b|\bDevice(Motion|Orientation)Event\b|\b(Accelerometer|Gyroscope)\b/i.test(line),
	dragging: (line) => /\bdraggable\b/i.test(line) || event('drag(?:start|end|over|enter|leave)?').test(line),
};

/** The most characters of a line a finding keeps. */
const MOST_LINE = 160;

/**
 * The source cells over `files`: each line that matches, by file and line. With none to read (null, or none at all),
 * each is not run, and `why` says why: reading nothing is never "none found".
 */
export const scanSources = (cells: CellId[], files: SourceFile[] | null, why = 'no source was given to read'): CellResult[] =>
	cells.flatMap((cell) => {
		const test = PATTERNS[cell];
		if (!test) return [];
		if (files === null || files.length === 0) return [notRun(cell, files === null ? why : 'the work has no files of its own to read')];
		const found: ProbeFinding[] = files.flatMap(({ path, text }) => {
			const lines = text.split('\n');
			return lines.flatMap((line, i) => {
				const around = lines.slice(Math.max(0, i - AROUND), i + AROUND + 1).join('\n');
				return test(line, around) ? [{ target: `${path}:${i + 1}`, detail: line.trim().slice(0, MOST_LINE) }] : [];
			});
		});
		return [resultFrom(cell, found)];
	});
