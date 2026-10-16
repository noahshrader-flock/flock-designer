import { COLOR_VALUES, type DesignToken, type ValueProperty } from './contract';
import { colorAsRead, hexOf } from './tokens';
import { allParts, shortValue } from './valueParts';

/**
 * How a component's value is named and said (adjusting a component), one way wherever one is: its Values, its control,
 * what a change moves, and what a save of it says in its commit and its pull request.
 */

/** How each property is named. */
export const VALUE_NAMES: Record<ValueProperty, string> = {
	height: 'Height',
	padding: 'Padding',
	radius: 'Radius',
	gap: 'Gap',
	fontSize: 'Font size',
	background: 'Background',
	text: 'Text',
	border: 'Border',
};

/** A value as it is named: its property, and its variant when it has one. */
export const valueTitle = (property: ValueProperty, variant: string | null): string =>
	variant === null ? VALUE_NAMES[property] : `${VALUE_NAMES[property]} · ${variant}`;

/** A value as it is read: a colour as a token's is (its hex, and its opacity), any other as it is written, short. */
export const saidValue = (property: ValueProperty, value: string): string =>
	COLOR_VALUES.has(property) ? colorAsRead(value) : shortValue(property, value);

/** How many tokens a value offers to follow: the first few, semantic before tones, as the reader lists them. */
const MOST_FOLLOWED = 3;

/**
 * The tokens a component's own value is the value of, which it could follow (Phase 4.6): a radius drawn the same on every
 * corner, as a radius token is; a colour, as a colour token is, in light (what the Values are read in), never a Dark one.
 */
export const tokensItCouldFollow = (property: ValueProperty, value: string, tokens: DesignToken[]): DesignToken[] => {
	const equal = (t: DesignToken): boolean => {
		if (COLOR_VALUES.has(property)) return t.kind === 'color' && t.group !== 'Dark' && hexOf(value) !== null && hexOf(t.value) === hexOf(value);
		if (property !== 'radius') return false;
		const corners = new Set(allParts(value, 4));
		return t.category === 'Shape' && corners.size === 1 && corners.has(t.value);
	};
	return tokens.filter(equal).slice(0, MOST_FOLLOWED);
};
