import { COLOR_VALUES, type ValueCell, type ValueProperty } from '../../src/shared/contract';
import { NONE_STARTS_AS, hexOf } from '../../src/shared/tokens';
import { allParts, partsIn, shortParts } from '../../src/shared/valueParts';
import { Popover } from '../../src/ui/Popover';
import { ColorField, LengthField } from './ValueFields';
import { VALUE_NAMES, valueTitle } from '../../src/shared/valueNames';
import { LinkButton } from '../../src/ui/LinkButton';

interface Part {
	label: string;
	part: number;
	hint?: string;
}
const at = (part: number, label: string, hint?: string): Part => ({ label, part, ...(hint ? { hint } : {}) });

/** Padding is said as engineers say it: X (left and right) before Y (top and bottom), though CSS writes top and bottom first. */
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

const ON_ONE_LINE: ReadonlySet<ValueProperty> = new Set(['padding']);

/** Tried as it moves, since nothing is built; nothing is saved, and Reset puts the value back as the library draws it. */
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
	follows?: { path: string; name: string }[];
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
