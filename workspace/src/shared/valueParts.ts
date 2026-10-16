import { COLOR_VALUES, type ValueProperty } from './domain/designSystem';
import { hexOf } from './tokens';

/**
 * How a component's drawn value is written (adjusting a component, DESIGN_SYSTEM.md), one way for every reader: the
 * page that reads it and tries it (`pageInstances.ts`), the analysis that says it (`componentValues.ts`), and the control
 * that changes it (`ValueEditor.tsx`).
 */

/** A colour that draws nothing (clear, or no border), as a value says it. */
export const NO_COLOR = 'none';

/**
 * The CSS longhands each property is read from and tried on, and how many parts its value is written with: a padding's four
 * sides, a radius's four corners and a gap's row and column each a part, in this order; a font size and a colour one, which a
 * border's colour is set on every side with (and read from its first side that has a border, `BORDER_COLOR`). A height is the element's box, read and set apart.
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

/** How many parts a property's value is written with in full. */
export const partsIn = (property: ValueProperty): 1 | 2 | 4 => (property === 'height' ? 1 : CSS_OF[property].parts);

/** A value written short, as CSS reads one to four parts (`0px 10px`), as all of its `n` parts (`0px 10px 0px 10px`). */
export const allParts = (value: string, n: 1 | 2 | 4): string[] => {
	if (n === 1) return [value];
	const [a, b = a, c = a, d = b] = value.split(' ') as [string, string?, string?, string?];
	return n === 2 ? [a, b] : [a, b, c, d];
};

/**
 * A value as a control writes it when it is tried (Phase 2), or null for one that is not that: a colour as its hex, a length as
 * every one of its parts in pixels, which is what the page draws and what the writer writes (`writtenAs`).
 */
export const asTried = (property: ValueProperty, value: string): string | null => {
	if (COLOR_VALUES.has(property)) return hexOf(value.trim());
	const parts = allParts(value.trim().replace(/\s+/g, ' '), partsIn(property));
	return parts.every((p) => pxOf(p) !== null) ? parts.join(' ') : null;
};

/** A length's pixels as the browser computes one (`8px`, `-2.5px`, `3.35544e+07px`); null for any other. */
export const pxOf = (part: string): number | null => {
	const m = /^(-?\d*\.?\d+(?:e[+-]?\d+)?)px$/.exec(part);
	return m ? Number(m[1]) : null;
};

/** A value as it is said: written short, the parts of one written in full (`0px 10px 0px 10px` is `0px 10px`). */
export const shortValue = (property: ValueProperty, value: string): string => {
	const n = partsIn(property);
	const parts = allParts(value, n).map((p) => (property === 'radius' && isFull(p) ? FULL : p));
	return n === 1 ? (parts[0] as string) : shortParts(parts).join(' ');
};

/** A length beyond any element's size: a pill's `9999px`, and `calc(infinity * 1px)` (Tailwind's `rounded-full`) as drawn. */
const FULL_PX = 9999;
/** How such a corner is said. */
const FULL = 'full';

/**
 * Whether a radius's corner is one that makes its end round, whatever the element's size, as drawn or as said ("full"): given
 * no control, since no length of it is one a person picks (Phase 5.5).
 */
export const isFull = (part: string): boolean => part === FULL || (pxOf(part) ?? 0) >= FULL_PX;

/** A value's parts written as short as CSS writes them: four sides that are one, one; top and bottom and the sides, two. */
export const shortParts = (parts: string[]): string[] => {
	if (parts.length === 2) return parts[0] === parts[1] ? [parts[0] as string] : parts;
	if (parts.length !== 4) return parts;
	const [a, b, c, d] = parts as [string, string, string, string];
	return a === b && b === c && c === d ? [a] : a === c && b === d ? [a, b] : b === d ? [a, b, c] : parts;
};
