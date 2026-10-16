import { COLOR_VALUES, type ValueProperty } from './contract';
import { colorAsRead } from './tokens';
import { shortValue } from './valueParts';

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
