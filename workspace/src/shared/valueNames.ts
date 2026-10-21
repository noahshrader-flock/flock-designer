import { COLOR_VALUES, type DesignToken, type ValueCell, type ValueProperty } from './contract';
import { PX_PER_REM, colorAsRead, hexOf, isDark, pixelsOf } from './tokens';
import { allParts, shortValue } from './valueParts';

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

export const storyComponent = (file: string): string => (file.split('/').pop() ?? file).replace(/\.stories\.[^.]+$/, '');

/** A split's pull request by what it is: its component (by the library's name for it where `names` has one), or its one file. */
export const unitName = (unit: { file: string | null; files: { path: string }[] }, names?: ReadonlyMap<string, string>): string =>
	unit.file === null ? (unit.files[0]?.path.split('/').pop() ?? '') : (names?.get(unit.file) ?? storyComponent(unit.file));

export const valueTitle = (property: ValueProperty, variant: string | null): string =>
	variant === null ? VALUE_NAMES[property] : `${VALUE_NAMES[property]} · ${variant}`;

export const saidValue = (property: ValueProperty, value: string): string =>
	COLOR_VALUES.has(property) ? colorAsRead(value) : shortValue(property, value);

/** The first few, semantic before tones, as the reader lists them. */
const MOST_FOLLOWED = 3;

/** A radius only when drawn the same on every corner; a colour only in light (what the Values are read in). */
export const tokensItCouldFollow = (property: ValueProperty, value: string, tokens: DesignToken[], perRem = PX_PER_REM): DesignToken[] => {
	const equal = (t: DesignToken): boolean => {
		if (COLOR_VALUES.has(property)) return t.kind === 'color' && !isDark(t) && hexOf(value) !== null && hexOf(t.value) === hexOf(value);
		if (property !== 'radius') return false;
		const corners = new Set(allParts(value, 4).map((c) => pixelsOf(c, perRem)));
		return t.category === 'Shape' && corners.size === 1 && pixelsOf(t.value, perRem) !== null && corners.has(pixelsOf(t.value, perRem));
	};
	return tokens.filter(equal).slice(0, MOST_FOLLOWED);
};

/** A value that is a token's already follows it; `perRem` is a rem's pixels on the page it is drawn on. */
export const followsOf = (
	property: ValueProperty,
	cell: Pick<ValueCell, 'kind' | 'value'>,
	tokens: DesignToken[],
	perRem = PX_PER_REM,
): DesignToken[] => (cell.kind === 'own' ? tokensItCouldFollow(property, cell.value, tokens, perRem) : []);
