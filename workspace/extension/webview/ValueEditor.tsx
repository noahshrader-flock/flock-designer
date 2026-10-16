import { COLOR_VALUES, type ValueCell, type ValueProperty } from '../../src/shared/contract';
import { NONE_STARTS_AS, hexOf } from '../../src/shared/tokens';
import { allParts, partsIn, shortParts } from '../../src/shared/valueParts';
import { Button } from './ui/Button';
import { Dialog, DialogButtons } from './ui/Dialog';
import { ColorField, LengthField } from './ValueFields';

/** How each property is named, in a value's row and its control. */
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

/** A value as it is named, in its control's title and its cell's label: its property, and its variant when it has one. */
export const valueTitle = (property: ValueProperty, variant: string | null): string =>
	variant === null ? VALUE_NAMES[property] : `${VALUE_NAMES[property]} · ${variant}`;

/** What each part of a value is called, by how many parts it is written with short, as CSS reads one to four. */
const PARTS: Partial<Record<ValueProperty, Record<number, string[]>>> = {
	padding: {
		1: ['All sides'],
		2: ['Top and bottom', 'Left and right'],
		3: ['Top', 'Left and right', 'Bottom'],
		4: ['Top', 'Right', 'Bottom', 'Left'],
	},
	radius: {
		1: ['All corners'],
		2: ['Top left and bottom right', 'Top right and bottom left'],
		3: ['Top left', 'Top right and bottom left', 'Bottom right'],
		4: ['Top left', 'Top right', 'Bottom right', 'Bottom left'],
	},
	gap: { 1: ['Rows and columns'], 2: ['Rows', 'Columns'] },
};

/**
 * A component's own value, tried in its stories (Phase 2 of adjusting a component): what opens from a value that is not a
 * token's, in a dialog over the page, beside its stories. A length is a slider for each part it is written with short (a side,
 * a corner, a row or a column), a colour a picker and its hex, each tried as it moves, since nothing is built; what is tried is
 * every part in full, as the page sets it. **Nothing is saved:** the dialog says so, and Reset puts the value back as the
 * library draws it. A token's value opens the token's own control instead, since it moves every component that draws with it.
 */
export const ValueEditor = ({
	property,
	cell,
	tried,
	onTry,
	onClose,
}: {
	property: ValueProperty;
	cell: ValueCell;
	/** The value being tried, in full, or null when it is as drawn. */
	tried: string | null;
	onTry: (value: string | null) => void;
	onClose: () => void;
}) => {
	const n = partsIn(property);
	const drawn = allParts(cell.value, n);
	const full = allParts(tried ?? cell.value, n);
	// Changed as it is written short, one slider for each part a person sees; the rest follow it, as CSS reads it.
	const parts = shortParts(full);
	const names = PARTS[property]?.[parts.length] ?? [VALUE_NAMES[property]];
	const was = shortParts(drawn).length === parts.length ? shortParts(drawn) : parts;
	return (
		<Dialog title={valueTitle(property, cell.variant)} onClose={onClose}>
			<div data-value-editor={property} className="token-editor">
				<p className="quiet">
					Tried in its stories here, on the {cell.instances === 1 ? 'instance' : `${cell.instances} instances`} that draw it: nothing is saved. As
					drawn, <code>{cell.value}</code>.
				</p>
				{COLOR_VALUES.has(property) ? (
					<ColorField live value={hexOf(tried ?? cell.value) ?? NONE_STARTS_AS} onCommit={onTry} />
				) : (
					parts.map((part, i) => (
						<LengthField
							key={names[i] ?? i}
							live
							label={names[i] ?? VALUE_NAMES[property]}
							value={part}
							was={was[i] ?? part}
							onCommit={(next) => onTry(allParts(parts.map((p, j) => (j === i ? next : p)).join(' '), n).join(' '))}
						/>
					))
				)}
				{cell.kind === 'derived' && (
					<p className="quiet">It is worked out from a token as drawn: a value of its own, tried here, is in place of that, in these stories only.</p>
				)}
			</div>
			<DialogButtons>
				{tried !== null && (
					<Button variant="secondary" onClick={() => onTry(null)}>
						Reset
					</Button>
				)}
			</DialogButtons>
		</Dialog>
	);
};
