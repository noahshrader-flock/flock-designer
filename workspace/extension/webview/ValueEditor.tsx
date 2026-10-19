import { COLOR_VALUES, type ValueCell, type ValueProperty } from '../../src/shared/contract';
import { NONE_STARTS_AS, hexOf } from '../../src/shared/tokens';
import { allParts, partsIn, shortParts } from '../../src/shared/valueParts';
import { Popover } from './ui/Popover';
import { ColorField, LengthField } from './ValueFields';
import { VALUE_NAMES, valueTitle } from '../../src/shared/valueNames';
import { LinkButton } from './ui/LinkButton';

/**
 * One slider of a value: what it is called, which part of the value it changes (CSS writes a value's parts in an order of its
 * own), and, for a short name, what it means in words, on its hover.
 */
interface Part {
	label: string;
	part: number;
	hint?: string;
}
const at = (part: number, label: string, hint?: string): Part => ({ label, part, ...(hint ? { hint } : {}) });

/**
 * What each part of a value is called, by how many parts it is written with short, as CSS reads one to four, in the order the
 * sliders are shown. Padding is said as engineers say it: **X** is left and right, **Y** top and bottom, X first, though CSS
 * writes top and bottom first.
 */
const PARTS: Partial<Record<ValueProperty, Record<number, Part[]>>> = {
	padding: {
		1: [at(0, 'All sides')],
		2: [at(1, 'X', 'Left and right'), at(0, 'Y', 'Top and bottom')],
		3: [at(0, 'Top'), at(1, 'X', 'Left and right'), at(2, 'Bottom')],
		4: [at(0, 'Top'), at(1, 'Right'), at(2, 'Bottom'), at(3, 'Left')],
	},
	radius: {
		1: [at(0, 'All corners')],
		2: [at(0, 'Top left and bottom right'), at(1, 'Top right and bottom left')],
		3: [at(0, 'Top left'), at(1, 'Top right and bottom left'), at(2, 'Bottom right')],
		4: [at(0, 'Top left'), at(1, 'Top right'), at(2, 'Bottom right'), at(3, 'Bottom left')],
	},
	gap: { 1: [at(0, 'Rows and columns')], 2: [at(0, 'Rows'), at(1, 'Columns')] },
};

/** The values whose parts have names short enough to sit on their slider's line, label, slider and number; the rest stack. */
const ON_ONE_LINE: ReadonlySet<ValueProperty> = new Set(['padding']);

/**
 * A component's own value, tried in its stories (Phase 2 of adjusting a component): a small popover under the value, since it
 * is a few fields for one thing, where a token's is a dialog. A length is a slider for each part it is written with short (a
 * side, a corner, a row or a column), a colour a picker and its hex, each tried as it moves, since nothing is built; what is
 * tried is every part in full, as the page sets it. **Nothing is saved**, which the tab says once, where what is tried is
 * counted; Reset puts the value back as the library draws it. A token's value opens the token's own control instead, since it
 * moves every component that draws with it.
 */
export const ValueEditor = ({
	property,
	cell,
	tried,
	onTry,
	follows = [],
	following = null,
	onFollow = () => undefined,
}: {
	property: ValueProperty;
	cell: ValueCell;
	/** The value being tried, in full, or null when it is as drawn. */
	tried: string | null;
	onTry: (value: string | null) => void;
	/** The tokens whose value it is, which it could follow (Phase 4.6), by path and name. */
	follows?: { path: string; name: string }[];
	/** The token it is to follow, by name, or null. */
	following?: string | null;
	onFollow?: (path: string) => void;
}) => {
	const n = partsIn(property);
	const drawn = allParts(cell.value, n);
	const full = allParts(tried ?? cell.value, n);
	// Changed as it is written short, one slider for each part a person sees, as many as the drawn value or the tried one has
	// (never fewer while one is dragged, so two parts made equal stay two); the rest follow them, as CSS reads it.
	const count = Math.max(shortParts(drawn).length, shortParts(full).length);
	const parts = full.slice(0, count);
	const fields = PARTS[property]?.[count] ?? [at(0, VALUE_NAMES[property])];
	const was = drawn.slice(0, count);
	const title = valueTitle(property, cell.variant);
	return (
		<Popover label={title}>
			<div data-value-editor={property} className="popover-body">
				<div className="popover-head">
					<span className="popover-title">{title}</span>
					{tried !== null && <LinkButton onPress={() => onTry(null)}>Reset</LinkButton>}
				</div>
				{COLOR_VALUES.has(property) ? (
					<ColorField live value={hexOf(tried ?? cell.value) ?? NONE_STARTS_AS} onCommit={onTry} />
				) : (
					fields.map(({ label, part, hint }) => (
						<div key={label} className={ON_ONE_LINE.has(property) ? 'popover-field popover-field-line' : 'popover-field'}>
							{parts.length > 1 && (
								<span className="popover-label" {...(hint ? { title: hint } : {})}>
									{label}
								</span>
							)}
							<LengthField
								live
								label={hint ? `${label} (${hint.toLowerCase()})` : label}
								value={parts[part] as string}
								was={was[part] ?? (parts[part] as string)}
								onCommit={(next) => onTry(allParts(parts.map((p, j) => (j === part ? next : p)).join(' '), n).join(' '))}
							/>
						</div>
					))
				)}
				{following !== null ? (
					<p className="popover-note" data-value-following>
						Follows {following}: the agent writes it so the token moves it. <LinkButton onPress={() => onTry(null)}>Keep its own</LinkButton>
					</p>
				) : (
					follows.map((t) => (
						<LinkButton key={t.path} marks={{ 'data-value-follow': t.path }} onPress={() => onFollow(t.path)}>
							Follow {t.name}
						</LinkButton>
					))
				)}
				{cell.kind === 'derived' && (
					<p className="popover-note">Worked out from a token as drawn: this is a value of its own in its place, in these stories only.</p>
				)}
			</div>
		</Popover>
	);
};
