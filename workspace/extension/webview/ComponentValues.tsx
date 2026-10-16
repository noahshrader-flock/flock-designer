import { type ReactNode, useRef, useState } from 'react';
import {
	COLOR_VALUES,
	type ComponentTokens,
	type ComponentValues as Values,
	type DesignToken,
	type TriedValue,
	type ValueCell,
	type ValueProperty,
	type ValueRow,
	triedId,
} from '../../src/shared/contract';
import { plural } from '../../src/shared/plural';
import { DEFAULT_THEME, THEMES, type Theme, themeLabel } from '../../src/shared/prototypeTheme';
import { labelOf } from '../../src/shared/tokens';
import { sharedWith } from '../../src/renderer/useComponentTokens';
import { NO_COLOR } from '../../src/shared/valueParts';
import { Swatch } from './ui/Swatch';
import { Toggle } from './ui/Toggle';
import { useDismiss } from './ui/useDismiss';
import { ValueEditor } from './ValueEditor';
import { VALUE_NAMES, saidValue, tokensItCouldFollow, valueTitle } from '../../src/shared/valueNames';

type Ready = Extract<ComponentTokens, { state: 'ready' }>;

/**
 * The values being tried on the component's instances, by `triedId`; how one is tried or put back (null); every one at once;
 * and having the agent write one (Phase 4.5, 4.6), how many times it has been asked, and what went wrong asking.
 */
export interface Trying {
	tried: ReadonlyMap<string, TriedValue>;
	onTry: (id: string, value: TriedValue | null) => void;
	onAll: (tried: TriedValue[]) => void;
	onWrite: (value: TriedValue) => void;
	writes: number;
	writeError: string | null;
}
/** Light and dark, as the review bar names them, as an empty and a filled circle: how a theme's light and dark read in a side bar. */
const MODES = THEMES.map((value) => ({ value, label: themeLabel(value), icon: value === 'dark' ? 'circle-large-filled' : 'circle-large-outline' }));

/** Why a component has no values to show, by what its drawing found. */
const WHY_NONE: Record<Exclude<Values['state'], 'read' | 'failed'>, (name: string) => string> = {
	'no-component': () => 'Its stories do not say which component they are of (`component` in their default export), so its values cannot be read.',
	'none-drawn': (name) =>
		`Its stories draw no ${name} on the page, so its values cannot be read. One that opens over the page, as a dialog does, is not read.`,
	wraps: () => 'Its stories draw it around other content, and what draws there is that content, so it has no values of its own here.',
	'not-drawn': () => 'Its stories did not finish drawing, so its values cannot be read. Its stories, beside this, say why.',
};

/**
 * What a value is made of, said short: the token it is (its name; where else it is used is the tooltip, and the Made from and
 * Usage parts say it fully), a part of one, or worked out from one. A value of the component's own has nothing to say; one
 * not checked says so only for the row (`Not checked`).
 */
interface Made {
	/** What it says in a line, or null when it is the component's own and there is nothing to add. */
	says: string | null;
	/** More, on hover: where else a token is used, or why a value is not a token. */
	why: string;
}
const madeOf = (cell: ValueCell, name: (path: string) => string, others: (path: string) => string[]): Made => {
	if (cell.kind === 'token')
		return { says: cell.tokens.map(name).join(', '), why: cell.tokens.map((p) => `${name(p)} · ${sharedWith(others(p))}`).join('\n') };
	if (cell.kind === 'mixed') return { says: `Partly ${cell.tokens.map(name).join(', ')}`, why: 'Partly a token, partly the component’s own.' };
	if (cell.kind === 'derived')
		return { says: 'Worked out from a token', why: 'It changes with the tokens, but is none of them: a shade, or a size that grows with one.' };
	if (cell.kind === 'own') return { says: null, why: 'The component’s own: set in the component itself, no token the analysis can mark gives it.' };
	return { says: 'Not checked', why: 'No token of this kind is marked when the stories are drawn, so whether it is one is not known.' };
};

/**
 * One value, as a button that opens its control, as a token's row reads: what it is called on the left (its variant, or, with
 * none, what it is), its value on the right (a colour with its swatch, marked when it is being tried), and, when it is a
 * token or worked out from one and its row's values are not all the same, what it is made of on a line under its name.
 * The control of a value of its own is a popover under it (`editor`, shown while `open`), closed by Escape, a press elsewhere
 * or the button again; a token's opens elsewhere, so it has none.
 */
const Cell = ({
	property,
	cell,
	made,
	line,
	tried,
	open,
	editor,
	onOpen,
	onClose,
	still = false,
}: {
	property: ValueProperty;
	cell: ValueCell;
	made: Made;
	/** Whether to say what it is made of under its name: when its row's values are not all one kind. */
	line: boolean;
	tried: string | null;
	open: boolean;
	editor: ReactNode;
	onOpen: () => void;
	onClose: () => void;
	/** Shown and never tried: a value drawn where nothing can be tried on it (a variant, Phase 5). */
	still?: boolean;
}) => {
	const value = saidValue(property, tried ?? cell.value);
	const wrap = useRef<HTMLLIElement>(null);
	const button = useRef<HTMLButtonElement>(null);
	useDismiss(open, wrap, onClose, button);
	// With no variant, what it is stands for one; with one, under it.
	const label = cell.variant ?? made.says ?? 'Its own';
	const under = line && cell.variant !== null && cell.value !== NO_COLOR ? made.says : null;
	const says = (
		<>
			<span className="value-label">{label}</span>
			<span className="value-drawn">
				{COLOR_VALUES.has(property) && value !== NO_COLOR && <Swatch value={tried ?? cell.value} />}
				<span>{value}</span>
				{tried !== null && <span data-changed-mark className="token-changed" aria-label="Tried" />}
			</span>
			{under !== null && (
				<span className="value-note" data-value-kind={cell.kind}>
					{under}
				</span>
			)}
		</>
	);
	if (still)
		return (
			<li data-value-cell className="token">
				<span className="value-cell" title={made.why}>
					{says}
				</span>
			</li>
		);
	return (
		<li ref={wrap} data-value-cell className="token" {...(tried !== null ? { 'data-tried': '' } : {})}>
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
		</li>
	);
};

/**
 * A property's group: its name, in the weight and colour of a token's set (Primary), with what tells its values apart after
 * it, and, when every value is the same thing and more than one, what that is, once, on the right; then each value. Its
 * heading stays at the top of the pane while the group is in view (the next replaces it).
 */
const Row = ({
	row,
	name,
	others,
	tried,
	editing,
	editor,
	onOpen,
	onClose,
	still = false,
}: {
	row: ValueRow;
	name: (path: string) => string;
	others: (path: string) => string[];
	tried: (cell: ValueCell) => string | null;
	/** The cell whose control is open, if it is this row's. */
	editing: ValueCell | null;
	editor: (cell: ValueCell) => ReactNode;
	onOpen: (cell: ValueCell) => void;
	onClose: () => void;
	/** Its values shown and never tried (`Cell`). */
	still?: boolean;
}) => {
	// What the values are is said once when every value that draws something is the same kind; a none says nothing of it.
	const drawing = row.cells.filter((c) => c.value !== NO_COLOR);
	const first = drawing[0];
	const same = first !== undefined && drawing.every((c) => c.kind === first.kind && c.tokens.join() === first.tokens.join());
	const once = same && row.cells.length > 1 ? madeOf(first, name, others) : null;
	return (
		<div data-value-row={row.property} className="value-group">
			<h3 className="value-group-name">
				<span>
					{VALUE_NAMES[row.property]}
					{row.by !== null && <span className="value-group-by">by {row.by}</span>}
				</span>
				{once?.says && (
					<span className="value-group-note" data-value-kind={first?.kind} title={once.why}>
						{once.says}
					</span>
				)}
			</h3>
			<ul className="tokens">
				{row.cells.map((c, i) => (
					<Cell
						key={i}
						property={row.property}
						cell={c}
						made={madeOf(c, name, others)}
						line={!same}
						tried={tried(c)}
						open={editing === c}
						editor={editor(c)}
						onOpen={() => onOpen(c)}
						onClose={onClose}
						still={still}
					/>
				))}
			</ul>
		</div>
	);
};

/** Values shown and never tried, as the Values rows are laid out: a component's variants (Phase 5), drawn where nothing is tried. */
export const StillRows = ({ rows, name, others }: { rows: ValueRow[]; name: (path: string) => string; others: (path: string) => string[] }) => (
	<>
		{rows.map((row) => (
			<Row
				key={row.property}
				row={row}
				name={name}
				others={others}
				tried={() => null}
				editing={null}
				editor={() => null}
				onOpen={() => undefined}
				onClose={() => undefined}
				still
			/>
		))}
	</>
);

/**
 * Values (Phase 1 of adjusting a component): what each instance of the component its stories draw measures, by property
 * and by variant, and whether each is a token's (named), worked out from one, or its own. Said to be as its
 * stories draw it, in light, on the version of the design system shown, so it is never taken for every use in a product;
 * and, when the design system has lengths no tag can be given, that a length said to be its own may be one of them.
 *
 * Each value opens its control (Phase 2): a token's opens the token's own (`onEditToken`), as Made from's rows do, since it
 * is the design system's and moves every component that draws with it; any other is tried on the instances that draw it,
 * in the stories beside this, as it moves (`ValueEditor`), and nothing is saved.
 */
export const ComponentValues = ({
	answer,
	name,
	version,
	byPath,
	tokenName,
	others,
	trying,
	onEditToken,
}: {
	answer: Ready;
	name: string;
	version: { branch: string; commit: string };
	byPath: ReadonlyMap<string, DesignToken>;
	/** A token's name, by its path; and the other components that draw with it, by name. */
	tokenName: (path: string) => string;
	others: (path: string) => string[];
	trying: Trying;
	onEditToken: (token: DesignToken) => void;
}) => {
	const { values } = answer;
	// Light until the other is chosen, as a prototype opens: the same first sight for everyone.
	const [mode, setMode] = useState<Theme>(DEFAULT_THEME);
	const [editing, setEditing] = useState<{ property: ValueProperty; cell: ValueCell } | null>(null);
	const tried = (property: ValueProperty) => (cell: ValueCell) => trying.tried.get(triedId({ property, targets: cell.targets }))?.value ?? null;
	const open = (property: ValueProperty) => (cell: ValueCell) => {
		const token = cell.kind === 'token' && cell.tokens.length === 1 ? byPath.get(cell.tokens[0] as string) : undefined;
		if (token) onEditToken(token);
		else setEditing({ property, cell });
	};
	// A value of its own's control, to be drawn under its cell.
	const editor = (property: ValueProperty) => (cell: ValueCell) => {
		const id = triedId({ property, targets: cell.targets });
		const following = trying.tried.get(id)?.follows ?? null;
		return (
			<ValueEditor
				property={property}
				cell={cell}
				tried={following === null ? tried(property)(cell) : null}
				onTry={(value) => trying.onTry(id, value === null ? null : { property, value, targets: cell.targets })}
				// A value of its own the same as a token's can follow it (4.6): drawn as it is, written by the agent.
				follows={
					cell.kind === 'own' ? tokensItCouldFollow(property, cell.value, [...byPath.values()]).map((t) => ({ path: t.path, name: labelOf(t) })) : []
				}
				following={following === null ? null : tokenName(following)}
				onFollow={(path) => {
					const value: TriedValue = { property, value: cell.value, targets: cell.targets, follows: path };
					trying.onTry(id, value);
					trying.onWrite(value);
				}}
			/>
		);
	};
	return (
		<section aria-label="Values" className="aside-section">
			<div className="aside-heading">
				<h2 className="aside-title">Values</h2>
				{values.state === 'read' && <Toggle label="Values in" options={MODES} value={mode} onChange={setMode} />}
			</div>
			{values.state === 'failed' ? (
				<p className="quiet">Its values could not be read: {values.error}</p>
			) : values.state !== 'read' ? (
				<p className="quiet">{WHY_NONE[values.state](name)}</p>
			) : (
				<>
					<p className="quiet" data-values-from>
						As its stories draw it, in {mode}: {plural(values.instances, 'instance')}, on {version.branch} at {version.commit.slice(0, 7)}.
					</p>
					{values.unmarked > 0 && (
						<p className="quiet" data-values-unmarked>
							{plural(values.unmarked, 'length')} in the design system {values.unmarked === 1 ? 'is' : 'are'} written in em or %, which cannot be
							marked, so a length said to be its own may be one of them.
						</p>
					)}
					{values.rows[mode] === null ? (
						<p className="quiet" data-values-none={mode}>
							Its stories did not draw it in {mode}, so its values there cannot be read.
						</p>
					) : (
						values.rows[mode]?.map((row) => (
							<Row
								key={row.property}
								row={row}
								name={tokenName}
								others={others}
								tried={tried(row.property)}
								editing={editing?.property === row.property ? editing.cell : null}
								editor={editor(row.property)}
								onOpen={open(row.property)}
								onClose={() => setEditing(null)}
							/>
						))
					)}
				</>
			)}
		</section>
	);
};
