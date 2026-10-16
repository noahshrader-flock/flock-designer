import { COLOR_VALUES, type ValueCell, type ValueProperty } from '../../src/shared/contract';
import { NONE_STARTS_AS, hexOf } from '../../src/shared/tokens';
import { allParts, partsIn, shortParts } from '../../src/shared/valueParts';
import { Popover } from './ui/Popover';
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
 * A component's own value, tried in its stories (Phase 2 of adjusting a component): a small popover under the value, since it
 * is a few fields for one thing, where a token's is a dialog. A length is a slider for each part it is written with short (a
 * side, a corner, a row or a column), a colour a picker and its hex, each tried as it moves, since nothing is built; what is
 * tried is every part in full, as the page sets it. **Nothing is saved:** it says so, and Reset puts the value back as the
 * library draws it. A token's value opens the token's own control instead, since it moves every component that draws with it.
 */
export const ValueEditor = ({
	property,
	cell,
	tried,
	onTry,
}: {
	property: ValueProperty;
	cell: ValueCell;
	/** The value being tried, in full, or null when it is as drawn. */
	tried: string | null;
	onTry: (value: string | null) => void;
}) => {
	const n = partsIn(property);
	const drawn = allParts(cell.value, n);
	const full = allParts(tried ?? cell.value, n);
	// Changed as it is written short, one slider for each part a person sees; the rest follow it, as CSS reads it.
	const parts = shortParts(full);
	const names = PARTS[property]?.[parts.length] ?? [VALUE_NAMES[property]];
	const was = shortParts(drawn).length === parts.length ? shortParts(drawn) : parts;
	const title = valueTitle(property, cell.variant);
	return (
		<Popover label={title}>
			<div data-value-editor={property} className="popover-body">
				<div className="popover-head">
					<span className="popover-title">{title}</span>
					{tried !== null && (
						<button type="button" className="link" onClick={() => onTry(null)}>
							Reset
						</button>
					)}
				</div>
				{COLOR_VALUES.has(property) ? (
					<ColorField live value={hexOf(tried ?? cell.value) ?? NONE_STARTS_AS} onCommit={onTry} />
				) : (
					parts.map((part, i) => (
						<div key={names[i] ?? i} className="popover-field">
							{parts.length > 1 && <span className="popover-label">{names[i]}</span>}
							<LengthField
								live
								label={names[i] ?? VALUE_NAMES[property]}
								value={part}
								was={was[i] ?? part}
								onCommit={(next) => onTry(allParts(parts.map((p, j) => (j === i ? next : p)).join(' '), n).join(' '))}
							/>
						</div>
					))
				)}
				<p className="quiet popover-note">
					Tried on {cell.instances === 1 ? 'the instance' : `${cell.instances} instances`} that draw it, as drawn <code>{cell.value}</code>: nothing
					is saved.
					{cell.kind === 'derived' && ' It is worked out from a token as drawn; this is a value of its own, in place of that, in these stories only.'}
				</p>
			</div>
		</Popover>
	);
};
