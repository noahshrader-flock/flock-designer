import { COLOR_VALUES, type ValueCell, type ValueProperty } from '../../src/shared/contract';
import { NONE_STARTS_AS, hexOf } from '../../src/shared/tokens';
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

/** What each part of a value is called, by how many parts it is written with, as CSS reads one to four. */
const PARTS: Partial<Record<ValueProperty, Record<number, string[]>>> = {
	padding: { 1: ['All sides'], 2: ['Top and bottom', 'Left and right'], 4: ['Top', 'Right', 'Bottom', 'Left'] },
	radius: {
		1: ['All corners'],
		2: ['Top left and bottom right', 'Top right and bottom left'],
		4: ['Top left', 'Top right', 'Bottom right', 'Bottom left'],
	},
	gap: { 1: ['Rows and columns'], 2: ['Rows', 'Columns'] },
};

/** A value's parts as it is written short, three written as the four they are (top, the sides, bottom). */
const partsOf = (value: string): string[] => {
	const p = value.split(' ');
	return p.length === 3 ? [p[0], p[1], p[2], p[1]].map(String) : p;
};

/**
 * A component's own value, tried in its stories (Phase 2 of adjusting a component): what opens from a value that is not a
 * token's, in a dialog over the page, beside its stories. A length is a slider for each part it is written with (a side, a
 * corner, a row or a column), a colour a picker and its hex, each tried as it moves, since nothing is built. **Nothing is
 * saved:** the dialog says so, and Reset puts the value back as the library draws it. A token's value opens the token's own
 * control instead, since a token is the design system's and moves every component that draws with it.
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
	/** The value being tried, or null when it is as drawn. */
	tried: string | null;
	onTry: (value: string | null) => void;
	onClose: () => void;
}) => {
	const value = tried ?? cell.value;
	const drawn = partsOf(cell.value);
	const parts = partsOf(value);
	const names = PARTS[property]?.[parts.length] ?? [VALUE_NAMES[property]];
	const title = cell.variant === null ? VALUE_NAMES[property] : `${VALUE_NAMES[property]} · ${cell.variant}`;
	return (
		<Dialog title={title} onClose={onClose}>
			<div data-value-editor={property} className="token-editor">
				<p className="quiet">
					Tried in its stories here, on the {cell.instances === 1 ? 'instance' : `${cell.instances} instances`} that draw it: nothing is saved. As
					drawn, <code>{cell.value}</code>.
				</p>
				{COLOR_VALUES.has(property) ? (
					<ColorField live value={hexOf(value) ?? NONE_STARTS_AS} onCommit={onTry} />
				) : (
					parts.map((part, i) => (
						<LengthField
							key={names[i] ?? i}
							live
							label={names[i] ?? VALUE_NAMES[property]}
							value={part}
							was={drawn[i] ?? part}
							onCommit={(next) => onTry(parts.map((p, j) => (j === i ? next : p)).join(' '))}
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
