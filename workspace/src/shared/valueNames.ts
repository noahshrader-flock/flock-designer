import { COLOR_VALUES, type DesignToken, type ValueCell, type ValueProperty } from './contract';
import { PX_PER_REM, colorAsRead, hexOf, isDark, pixelsOf } from './tokens';
import { allParts, shortValue } from './valueParts';

/**
 * How a component's value is named and said (adjusting a component), one way wherever one is: its Values, its control,
 * what a change moves, and what a save of it says in its commit and its pull request.
 */

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

/** The component a story file is of, as a save names it: its file's name (`FSButton.stories.tsx` is FSButton). */
export const storyComponent = (file: string): string => (file.split('/').pop() ?? file).replace(/\.stories\.[^.]+$/, '');

/** A value as it is named: its property, and its variant when it has one. */
export const valueTitle = (property: ValueProperty, variant: string | null): string =>
	variant === null ? VALUE_NAMES[property] : `${VALUE_NAMES[property]} · ${variant}`;

/** A value as it is read: a colour as a token's is (its hex, and its opacity), any other as it is written, short. */
export const saidValue = (property: ValueProperty, value: string): string =>
	COLOR_VALUES.has(property) ? colorAsRead(value) : shortValue(property, value);

/** How many tokens a value offers to follow: the first few, semantic before tones, as the reader lists them. */
const MOST_FOLLOWED = 3;

/**
 * The tokens a component's own value is the value of, which it could follow: a radius drawn the same on every
 * corner, as a radius token is; a colour, as a colour token is, in light (what the Values are read in), never a Dark one.
 */
export const tokensItCouldFollow = (property: ValueProperty, value: string, tokens: DesignToken[], perRem = PX_PER_REM): DesignToken[] => {
	const equal = (t: DesignToken): boolean => {
		if (COLOR_VALUES.has(property)) return t.kind === 'color' && !isDark(t) && hexOf(value) !== null && hexOf(t.value) === hexOf(value);
		if (property !== 'radius') return false;
		// The same length however it is written: a 4px corner is a 0.25rem token's.
		const corners = new Set(allParts(value, 4).map((c) => pixelsOf(c, perRem)));
		return t.category === 'Shape' && corners.size === 1 && pixelsOf(t.value, perRem) !== null && corners.has(pixelsOf(t.value, perRem));
	};
	return tokens.filter(equal).slice(0, MOST_FOLLOWED);
};

/**
 * The tokens a component's value could be made to follow: only a value of its own (one that is a token's already follows it),
 * a rem being `perRem` pixels on the page it is drawn on.
 */
export const followsOf = (
	property: ValueProperty,
	cell: Pick<ValueCell, 'kind' | 'value'>,
	tokens: DesignToken[],
	perRem = PX_PER_REM,
): DesignToken[] => (cell.kind === 'own' ? tokensItCouldFollow(property, cell.value, tokens, perRem) : []);
