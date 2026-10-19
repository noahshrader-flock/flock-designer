import { type ReactNode, useId, useRef, useState } from 'react';
import {
	COLOR_VALUES,
	type ComponentTokens,
	type ComponentValues as Values,
	type ComponentVariants,
	type DesignToken,
	type TriedValue,
	type ValueCell,
	type ValueProperty,
	type ValueRow,
	shownMode,
	triedId,
} from '../../src/shared/contract';
import { type Picker, type Selection, firstSelection, inspect, offOf, optionLabel, pickersOf, propLabel, rowName } from './inspector';
import { plural } from '../../src/shared/plural';
import { labelOf } from '../../src/shared/tokens';
import { NO_COLOR, allParts, isFull } from '../../src/shared/valueParts';
import { followsOf, saidValue, valueTitle } from '../../src/shared/valueNames';
import { sharedWith } from './hooks/useComponentTokens';
import { useMode } from './shared';
import { ValueEditor } from './ValueEditor';
import { Disclosure } from '../../src/ui/Section';
import { Select } from '../../src/ui/Field';
import { AsidePart } from '../../src/ui/AsidePart';
import { ColorDot } from '../../src/ui/ColorDot';
import { InfoTip } from '../../src/ui/InfoTip';
import { Switch } from '../../src/ui/Switch';
import { useDismiss } from '../../src/ui/useDismiss';
import { ValueItem, ValueList } from '../../src/ui/ValueItem';
import { Message } from '../../src/ui/Message';
import { Heading } from '../../src/ui/Heading';
import { ChangedMark } from '../../src/ui/ChangedMark';

type Ready = Extract<ComponentTokens, { state: 'ready' }>;

export interface Trying {
	tried: ReadonlyMap<string, TriedValue>;
	onTry: (id: string, value: TriedValue | null) => void;
	onAll: (tried: TriedValue[]) => void;
	onWrite: (value: TriedValue) => void;
	writes: number;
	writeError: string | null;
}

const WHY_NONE: Record<Exclude<Values['state'], 'read' | 'failed'>, (name: string) => string> = {
	'no-component': () => 'Its stories do not say which component they are of (`component` in their default export), so its values cannot be read.',
	'none-drawn': (name) =>
		`Its stories draw no ${name} on the page, so its values cannot be read. One that opens over the page, as a dialog does, is not read.`,
	wraps: () => 'Its stories draw it around other content, and what draws there is that content, so it has no values of its own here.',
	'not-drawn': () => 'Its stories did not finish drawing, so its values cannot be read. Its stories, beside this, say why.',
};

interface Made {
	says: string | null;
	why: string;
}
const madeOf = (cell: ValueCell, name: (path: string) => string, others: (path: string) => string[]): Made => {
	if (cell.kind === 'token')
		return { says: cell.tokens.map(name).join(', '), why: cell.tokens.map((p) => `${name(p)} · ${sharedWith(others(p))}`).join('\n') };
	if (cell.kind === 'mixed')
		return { says: `Partly ${cell.tokens.map(name).join(', ')}`, why: 'Partly a token; the rest is the component’s own, or worked out from tokens.' };
	if (cell.kind === 'derived')
		return { says: 'From a token', why: 'It changes with the tokens, but is none of them: a shade, or a size that grows with one.' };
	if (cell.kind === 'own') return { says: null, why: 'The component’s own: set in the component itself, no token the analysis can mark gives it.' };
	return { says: null, why: 'Not checked: no token of this kind is marked when the stories are drawn, so whether it is one is not known.' };
};

const Cell = ({
	property,
	cell,
	made,
	tried,
	open,
	editor,
	onOpen,
	onClose,
	still = false,
	label,
}: {
	property: ValueProperty;
	cell: ValueCell;
	made: Made;
	tried: string | null;
	open: boolean;
	editor: ReactNode;
	onOpen: () => void;
	onClose: () => void;
	/** Drawn only from its props, where nothing can be tried on it: shown, never tried. */
	still?: boolean;
	label: string;
}) => {
	const value = saidValue(property, tried ?? cell.value);
	const wrap = useRef<HTMLLIElement>(null);
	const button = useRef<HTMLButtonElement>(null);
	useDismiss(open, wrap, onClose, button);
	// A colour that draws nothing is none, whatever made it, and has no dot.
	if (COLOR_VALUES.has(property) && value !== NO_COLOR)
		return (
			<ValueItem rowRef={wrap} marks={{ 'data-value-cell': '', ...(still ? { 'data-still': '' } : tried !== null ? { 'data-tried': '' } : {}) }}>
				<div className="value-cell">
					<span className="value-label">{label}</span>
					<ColorDot
						value={tried ?? cell.value}
						{...(cell.kind === 'token' && made.says !== null ? { says: made.says } : {})}
						name={valueTitle(property, cell.variant)}
						{...(still ? {} : { onPress: open ? onClose : onOpen, popup: { open } })}
						{...(tried !== null ? { mark: 'Tried' as const } : {})}
						buttonRef={button}
					/>
				</div>
				{open && !still && editor}
			</ValueItem>
		);
	// A token's name stands where its number would ("Radius · Radius base", not "Radius · 8px"): the number is the token's to say, in its control.
	const isToken = cell.kind === 'token' && made.says !== null;
	const chip = isToken || cell.value === NO_COLOR ? null : made.says;
	const says = (
		<>
			{chip === null ? (
				<span className="value-label">{label}</span>
			) : (
				<span className="value-label value-label-chipped">
					<span className="value-name">{label}</span>
					<span className="value-chip" data-value-kind={cell.kind}>
						{chip}
					</span>
				</span>
			)}
			<span className="value-drawn">
				{isToken ? <span className="value-token">{made.says}</span> : <span>{value}</span>}
				{tried !== null && <ChangedMark says="Tried" />}
			</span>
		</>
	);
	// A radius that makes its ends round has no length to change: shown as drawn.
	if (still || (property === 'radius' && allParts(cell.value, 4).some(isFull)))
		return (
			<ValueItem marks={{ 'data-value-cell': '', ...(still ? { 'data-still': '' } : {}) }}>
				<span className="value-cell" title={still ? `${made.why}\nDrawn from its props, on one of its stories: shown, not tried.` : made.why}>
					{says}
				</span>
			</ValueItem>
		);
	return (
		<ValueItem rowRef={wrap} marks={{ 'data-value-cell': '', ...(tried !== null ? { 'data-tried': '' } : {}) }}>
			<button
				ref={button}
				type="button"
				className="value-cell token-button"
				aria-label={`Change ${valueTitle(property, cell.variant)}`}
				aria-haspopup="dialog"
				aria-expanded={open}
				title={`${made.why}${tried !== null ? `\nTried; drawn ${cell.value}` : ''}`}
				onClick={open ? onClose : onOpen}
			>
				{says}
			</button>
			{open && editor}
		</ValueItem>
	);
};

/** How a picker's value is kept in a dropdown, which takes strings: drawn without the prop (its default) is this. */
const DEFAULT = '\u0000default';

const SET_BY_STORY = 'Its story sets this itself: drawn with another value, it draws as the story has it.';

const PickerRow = ({
	picker,
	value,
	fixed,
	onChange,
}: {
	picker: Picker;
	value: string | null;
	fixed: boolean;
	onChange: (value: string | null) => void;
}) => {
	const id = useId();
	return (
		<div data-picker={picker.prop} className="picker-row">
			<span className="picker-name">
				<label htmlFor={id} className="picker-label">
					{propLabel(picker.prop)}
				</label>
				{fixed && <InfoTip text={SET_BY_STORY} />}
			</span>
			{picker.switch ? (
				<Switch id={id} on={value === 'true'} onChange={(on) => onChange(on ? 'true' : offOf(picker))} />
			) : (
				<Select
					control={{ id }}
					value={value ?? DEFAULT}
					onChange={(v) => onChange(v === DEFAULT ? null : v)}
					options={picker.options.map((o) => ({ value: o ?? DEFAULT, label: optionLabel(o) }))}
				/>
			)}
		</div>
	);
};

const Inspector = ({
	rows,
	declared,
	fixed,
	name,
	others,
	tried,
	editing,
	editor,
	onOpen,
	onClose,
}: {
	rows: ValueRow[];
	declared: ValueRow[];
	fixed: string[];
	name: (path: string) => string;
	others: (path: string) => string[];
	tried: (property: ValueProperty) => (cell: ValueCell) => string | null;
	editing: { property: ValueProperty; cell: ValueCell } | null;
	editor: (property: ValueProperty) => (cell: ValueCell) => ReactNode;
	onOpen: (property: ValueProperty) => (cell: ValueCell) => void;
	onClose: () => void;
}) => {
	const pickers = pickersOf([...rows, ...declared]);
	const [chosen, setChosen] = useState<Selection>({});
	const kept = Object.fromEntries(Object.entries(chosen).filter(([prop, v]) => pickers.some((p) => p.prop === prop && p.options.includes(v))));
	const selection = { ...firstSelection(pickers), ...kept };
	const cellOf = (property: ValueProperty, cell: ValueCell, label: string, still = false) => (
		<Cell
			key={`${property}${triedId({ property, targets: cell.targets })}`}
			property={property}
			cell={cell}
			made={madeOf(cell, name, others)}
			tried={still ? null : tried(property)(cell)}
			open={editing?.property === property && editing.cell === cell}
			editor={editor(property)(cell)}
			onOpen={() => onOpen(property)(cell)}
			onClose={onClose}
			label={label}
			still={still}
		/>
	);
	return (
		<>
			{pickers.length > 0 && (
				<div data-pickers className="pickers">
					{pickers.map((p) => (
						<PickerRow
							key={p.prop}
							picker={p}
							value={selection[p.prop] ?? null}
							fixed={fixed.includes(p.prop)}
							onChange={(v) => setChosen((was) => ({ ...was, [p.prop]: v }))}
						/>
					))}
				</div>
			)}
			{inspect(rows, pickers, selection, declared).map((group) => (
				<div key={group.name} data-value-group={group.name} className="value-group">
					<Heading size="group">{group.name}</Heading>
					<ValueList>
						{group.rows.map(({ row, shown }) =>
							shown.cell === null ? (
								<ValueItem key={row.property} marks={{ 'data-value-row': row.property, 'data-not-drawn': '' }}>
									<span
										className="value-cell"
										title={
											shown.nearest
												? `Not drawn with this. Nearest: ${shown.nearest.variant ?? ''} ${saidValue(row.property, shown.nearest.value)}`
												: 'Not drawn with this.'
										}
									>
										<span className="value-label">{rowName(row.property)}</span>
										<span className="value-drawn quiet">Not drawn with this</span>
									</span>
								</ValueItem>
							) : (
								<ValueItem key={row.property} marks={{ 'data-value-row': row.property }}>
									<ValueList>{cellOf(row.property, shown.cell, rowName(row.property), shown.still)}</ValueList>
									{shown.more.length > 0 && (
										<Disclosure label={`${shown.more.length} more`}>
											<ValueList>{shown.more.map((c) => cellOf(row.property, c, plural(c.instances, 'instance'), shown.still))}</ValueList>
										</Disclosure>
									)}
								</ValueItem>
							),
						)}
					</ValueList>
				</div>
			))}
		</>
	);
};

/** A token's value opens the token's own control, since it moves every component drawn with it; any other is only tried here, never saved. */
export const ComponentValues = ({
	answer,
	name,
	byPath,
	tokenName,
	others,
	trying,
	onEditToken,
	variants,
}: {
	answer: Ready;
	variants: ComponentVariants;
	name: string;
	byPath: ReadonlyMap<string, DesignToken>;
	tokenName: (path: string) => string;
	others: (path: string) => string[];
	trying: Trying;
	onEditToken: (token: DesignToken) => void;
}) => {
	const { values } = answer;
	const [chosen] = useMode();
	const mode = values.state === 'read' ? shownMode(values.rows, chosen) : chosen;
	const [editing, setEditing] = useState<{ property: ValueProperty; cell: ValueCell } | null>(null);
	// Its props' drawing is in light only, so it adds its cases there.
	const declared = mode === 'light' && variants.state === 'ready' && variants.values.state === 'read' ? (variants.values.rows.light ?? []) : [];
	const tried = (property: ValueProperty) => (cell: ValueCell) => trying.tried.get(triedId({ property, targets: cell.targets }))?.value ?? null;
	const open = (property: ValueProperty) => (cell: ValueCell) => {
		const token = cell.kind === 'token' && cell.tokens.length === 1 ? byPath.get(cell.tokens[0] as string) : undefined;
		if (token) onEditToken(token);
		else setEditing({ property, cell });
	};
	const editor = (property: ValueProperty) => (cell: ValueCell) => {
		const id = triedId({ property, targets: cell.targets });
		const following = trying.tried.get(id)?.follows ?? null;
		return (
			<ValueEditor
				property={property}
				cell={cell}
				tried={following === null ? tried(property)(cell) : null}
				onTry={(value) => trying.onTry(id, value === null ? null : { property, value, targets: cell.targets })}
				follows={followsOf(property, cell, [...byPath.values()], values.state === 'read' ? values.rootPx : undefined).map((t) => ({
					path: t.path,
					name: labelOf(t),
				}))}
				following={following === null ? null : tokenName(following)}
				onFollow={(path) => trying.onTry(id, { property, value: cell.value, targets: cell.targets, follows: path })}
			/>
		);
	};
	return (
		<AsidePart title="Styles">
			{values.state === 'failed' ? (
				<Message>Its values could not be read: {values.error}</Message>
			) : values.state !== 'read' ? (
				<Message>{WHY_NONE[values.state](name)}</Message>
			) : (
				<>
					{values.unmarked > 0 && (
						<Message marks={{ 'data-values-unmarked': '' }}>
							{plural(values.unmarked, 'length')} in the design system {values.unmarked === 1 ? 'is' : 'are'} written in em or %, which cannot be
							marked, so a length said to be its own may be one of them.
						</Message>
					)}
					{values.rows[mode] === null ? (
						<Message marks={{ 'data-values-none': mode }}>Its stories did not draw it in {mode}, so its values there cannot be read.</Message>
					) : (
						<Inspector
							rows={values.rows[mode] ?? []}
							declared={declared}
							fixed={variants.state === 'ready' ? variants.fixed : []}
							name={tokenName}
							others={others}
							tried={tried}
							editing={editing}
							editor={editor}
							onOpen={open}
							onClose={() => setEditing(null)}
						/>
					)}
				</>
			)}
		</AsidePart>
	);
};
