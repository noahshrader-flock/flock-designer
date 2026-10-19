import { COLOR_VALUES, type ValueProperty } from './domain/designSystem';
import { hexOf } from './tokens';

/** Clear, or no border. */
export const NO_COLOR = 'none';

/** Never read off an instance, and shared with what reads its props back, so a prop not read is never taken as not given. */
export const NOT_VARIANT =
	/^(children|className|style|sx|css|id|key|ref|role|tabIndex|href|src|alt|title|name|value|defaultValue|placeholder|label|as|component|slot|form|htmlFor|type)$|^(on[A-Z]|aria-|data-)/;

/**
 * Parts in this order. A border's colour is set on every side and read from its first with a border; a height is the
 * element's box, read and set apart.
 */
export const CSS_OF: Record<Exclude<ValueProperty, 'height'>, { names: string[]; parts: 1 | 2 | 4 }> = {
	padding: { names: ['padding-top', 'padding-right', 'padding-bottom', 'padding-left'], parts: 4 },
	radius: { names: ['border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius'], parts: 4 },
	gap: { names: ['row-gap', 'column-gap'], parts: 2 },
	fontSize: { names: ['font-size'], parts: 1 },
	background: { names: ['background-color'], parts: 1 },
	text: { names: ['color'], parts: 1 },
	border: { names: ['border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color'], parts: 1 },
};

export const partsIn = (property: ValueProperty): 1 | 2 | 4 => (property === 'height' ? 1 : CSS_OF[property].parts);

/** Short as CSS reads it (`0px 10px`) to all of its `n` parts (`0px 10px 0px 10px`). */
export const allParts = (value: string, n: 1 | 2 | 4): string[] => {
	if (n === 1) return [value];
	const [a, b = a, c = a, d = b] = value.split(' ') as [string, string?, string?, string?];
	return n === 2 ? [a, b] : [a, b, c, d];
};

/** A colour as its hex, a length as every part in pixels (what the page draws); null for anything else. */
export const asTried = (property: ValueProperty, value: string): string | null => {
	if (COLOR_VALUES.has(property)) return hexOf(value.trim());
	const parts = allParts(value.trim().replace(/\s+/g, ' '), partsIn(property));
	return parts.every((p) => pxOf(p) !== null) ? parts.join(' ') : null;
};

/** As the browser computes one, exponents included (`3.35544e+07px`). */
export const pxOf = (part: string): number | null => {
	const m = /^(-?\d*\.?\d+(?:e[+-]?\d+)?)px$/.exec(part);
	return m ? Number(m[1]) : null;
};

export const shortValue = (property: ValueProperty, value: string): string => {
	const n = partsIn(property);
	const parts = allParts(value, n).map((p) => (property === 'radius' && isFull(p) ? FULL : p));
	return n === 1 ? (parts[0] as string) : shortParts(parts).join(' ');
};

/** A pill's `9999px`, and `calc(infinity * 1px)` (Tailwind's `rounded-full`) as drawn. */
const FULL_PX = 9999;
const FULL = 'full';

/** Given no control, since no length of it is one a person picks. */
export const isFull = (part: string): boolean => part === FULL || (pxOf(part) ?? 0) >= FULL_PX;

export const shortParts = (parts: string[]): string[] => {
	if (parts.length === 2) return parts[0] === parts[1] ? [parts[0] as string] : parts;
	if (parts.length !== 4) return parts;
	const [a, b, c, d] = parts as [string, string, string, string];
	return a === b && b === c && c === d ? [a] : a === c && b === d ? [a, b] : b === d ? [a, b, c] : parts;
};
