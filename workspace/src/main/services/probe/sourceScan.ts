/**
 * The probe's source cells (A3): what a page cannot show, found in the work's own source by the names the web platform
 * gives it (DOM events and APIs, CSS), so it reads the same in any framework's files. A finding here is something to look
 * at, not a fault: whether a shortcut can be turned off, or a drag has another way, is judged after (A4).
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

/** What each source cell looks for, by line, with the lines around it. Every source cell has one (a test holds it). */
export const PATTERNS: Partial<Record<CellId, (line: string, around: string) => boolean>> = {
	'key-shortcuts': (line, around) =>
		(/\b(key|code)\s*===?\s*['"](?:Key)?[A-Za-z0-9?/.,;]['"]/.test(line) || /['"][A-Za-z0-9?/]['"]\s*===?\s*\w+\.key\b/.test(line)) &&
		!/\b(ctrlKey|metaKey|altKey)\b/.test(around),
	timing: (line) => /\bset(Timeout|Interval)\s*\(/.test(line) && delays(line).some((ms) => ms >= 20_000),
	flashing: (line, around) =>
		/\banimation(-duration)?\s*:/.test(line) && /\binfinite\b/.test(around) && times(line).some((ms) => ms > 0 && ms <= 333),
	'pointer-gestures': (line) => /\btouches\.length\b|\bgesture(start|change|end)\b|\bon-?touch-?move\b|['"]touchmove['"]/i.test(line),
	'pointer-cancellation': (line) => /\bon-?(mouse|pointer)-?down\b|\bon-?touch-?start\b|['"](mouse|pointer)down['"]|['"]touchstart['"]/i.test(line),
	'motion-actuation': (line) => /\bdevice-?(motion|orientation)\b|\bDevice(Motion|Orientation)Event\b|\b(Accelerometer|Gyroscope)\b/i.test(line),
	dragging: (line) => /\bdraggable\b|\bon-?drag(start|end|over|enter|leave)?\b|['"]drag(start|end|over|enter|leave)?['"]/i.test(line),
};

/** The most characters of a line a finding keeps. */
const MOST_LINE = 160;

/**
 * The source cells over `files`: each line that matches, by file and line. With no files, each is not run, and `why`
 * says why (the run was given none to read).
 */
export const scanSources = (cells: CellId[], files: SourceFile[] | null, why = 'no source was given to read'): CellResult[] =>
	cells.flatMap((cell) => {
		const test = PATTERNS[cell];
		if (!test) return [];
		if (files === null) return [notRun(cell, why)];
		const found: ProbeFinding[] = files.flatMap(({ path, text }) => {
			const lines = text.split('\n');
			return lines.flatMap((line, i) => {
				const around = lines.slice(Math.max(0, i - AROUND), i + AROUND + 1).join('\n');
				return test(line, around) ? [{ target: `${path}:${i + 1}`, detail: line.trim().slice(0, MOST_LINE) }] : [];
			});
		});
		return [resultFrom(cell, found)];
	});
