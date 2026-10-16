import { useState } from 'react';
import {
	COLOR_VALUES,
	type ComponentTokens,
	type ComponentValues as Values,
	type DesignToken,
	type TriedValue,
	type ValueCell,
	type ValueProperty,
	type ValueRow,
} from '../../src/shared/contract';
import { plural } from '../../src/shared/plural';
import { DEFAULT_THEME, THEMES, type Theme, themeLabel } from '../../src/shared/prototypeTheme';
import { colorAsRead, labelOf } from '../../src/shared/tokens';
import { MOST_LISTED, sharedWith } from '../../src/renderer/useComponentTokens';
import { Disclosure } from './ui/Disclosure';
import { Swatch } from './ui/Swatch';
import { Toggle } from './ui/Toggle';
import { NO_COLOR, shortValue } from '../../src/shared/valueParts';
import { VALUE_NAMES, ValueEditor, valueTitle } from './ValueEditor';

type Ready = Extract<ComponentTokens, { state: 'ready' }>;

/** What names a value tried: its property and the instances it is for, the same in light and in dark. */
export const triedId = (property: ValueProperty, cell: ValueCell): string => `${property}\u0000${cell.targets.join('\u0001')}`;

/** The values being tried on the component's instances, by `triedId`, and how one is tried or put back (null). */
export interface Trying {
	tried: ReadonlyMap<string, TriedValue>;
	onTry: (id: string, value: TriedValue | null) => void;
}
/** Light and dark, as the review bar names them, as an empty and a filled circle: how a theme's light and dark read in a side bar. */
const MODES = THEMES.map((value) => ({ value, label: themeLabel(value), icon: value === 'dark' ? 'circle-large-filled' : 'circle-large-outline' }));

/** Why a component has no values to show, by what its drawing found. */
const WHY_NO_COLOR: Record<Exclude<Values['state'], 'read' | 'failed'>, (name: string) => string> = {
	'no-component': () => 'Its stories do not say which component they are of (`component` in their default export), so its values cannot be read.',
	'none-drawn': (name) =>
		`Its stories draw no ${name} on the page, so its values cannot be read. One that opens over the page, as a dialog does, is not read.`,
	wraps: () => 'Its stories draw it around other content, and what draws there is that content, so it has no values of its own here.',
	'not-drawn': () => 'Its stories did not finish drawing, so its values cannot be read. Its stories, beside this, say why.',
};

/** What a value is, said: the token it is with the other components that share it, or the component's own, or why neither. */
const kindOf = (cell: ValueCell, name: (path: string) => string, others: (path: string) => string[]): { says: string; why?: string } => {
	if (cell.kind === 'token') return { says: cell.tokens.map((p) => `${name(p)} · ${sharedWith(others(p))}`).join('; ') };
	if (cell.kind === 'mixed') return { says: `Partly ${cell.tokens.map(name).join(', ')}, partly its own` };
	if (cell.kind === 'own') return { says: 'Its own', why: 'Set in the component itself: no token the analysis can mark gives it.' };
	if (cell.kind === 'derived')
		return { says: 'Worked out from a token', why: 'It changes with the tokens, but is none of them: a shade, or a size that grows with one.' };
	return { says: 'Not checked', why: 'No token of this kind is marked when the stories are drawn, so whether it is one is not known.' };
};

/** A value as it is read: a colour as a token's is (its hex, and its opacity), any other as it is written, short. */
const saidValue = (property: ValueProperty, value: string): string => (COLOR_VALUES.has(property) ? colorAsRead(value) : shortValue(property, value));

/**
 * One value, as a button that opens its control: its variant beside its value (a colour with its swatch, marked when it is
 * being tried), and, when the row's values are not all one kind, what it is, on a line under them where it can be read whole.
 */
const Cell = ({
	property,
	cell,
	note,
	tried,
	onOpen,
}: {
	property: ValueProperty;
	cell: ValueCell;
	note: { says: string; why?: string } | null;
	tried: string | null;
	onOpen: () => void;
}) => {
	const value = saidValue(property, tried ?? cell.value);
	return (
		<li data-value-cell className="token" {...(tried !== null ? { 'data-tried': '' } : {})}>
			<button
				type="button"
				className="value-cell token-button"
				aria-label={`Change ${valueTitle(property, cell.variant)}`}
				title={tried !== null ? `Tried; drawn ${cell.value}` : `${cell.instances} drawn`}
				onClick={onOpen}
			>
				{cell.variant !== null && <span className="value-variant">{cell.variant}</span>}
				<span className="value-drawn">
					{COLOR_VALUES.has(property) && value !== NO_COLOR && <Swatch value={tried ?? cell.value} />}
					<span>{value}</span>
					{tried !== null && <span data-changed-mark className="token-changed" aria-label="Tried" />}
				</span>
				{note && cell.value !== NO_COLOR && (
					<span className="value-note" data-value-kind={cell.kind} title={note.why}>
						{note.says}
					</span>
				)}
			</button>
		</li>
	);
};

/** A property's row: its name and what tells its values apart, its values, and what they are, once when they are all one kind. */
const Row = ({
	row,
	name,
	others,
	tried,
	onOpen,
}: {
	row: ValueRow;
	name: (path: string) => string;
	others: (path: string) => string[];
	tried: (cell: ValueCell) => string | null;
	onOpen: (cell: ValueCell) => void;
}) => {
	// What the values are is said once when every value that draws something is the same kind; a none says nothing of it.
	const drawing = row.cells.filter((c) => c.value !== NO_COLOR);
	const first = drawing[0];
	const same = first !== undefined && drawing.every((c) => c.kind === first.kind && c.tokens.join() === first.tokens.join());
	const shared = same ? kindOf(first, name, others) : null;
	const cell = (c: ValueCell, i: number) => (
		<Cell key={i} property={row.property} cell={c} note={same ? null : kindOf(c, name, others)} tried={tried(c)} onOpen={() => onOpen(c)} />
	);
	return (
		<div data-value-row={row.property} className="token-group">
			<h3 className="token-group-name value-row-name">
				<span>
					{VALUE_NAMES[row.property]}
					{row.by !== null && <span className="quiet"> · by {row.by}</span>}
				</span>
				{shared && (
					<span className="token-uses" data-value-kind={first?.kind} title={shared.why}>
						{shared.says}
					</span>
				)}
			</h3>
			<ul className="tokens">{row.cells.slice(0, MOST_LISTED).map(cell)}</ul>
			{row.cells.length > MOST_LISTED && (
				<Disclosure label={`Show ${row.cells.length - MOST_LISTED} more`}>
					<ul className="tokens">{row.cells.slice(MOST_LISTED).map((c, i) => cell(c, MOST_LISTED + i))}</ul>
				</Disclosure>
			)}
		</div>
	);
};

/**
 * Values (Phase 1 of adjusting a component): what each instance of the component its stories draw measures, by property
 * and by variant, and whether each is a token's, shared with which other components, or its own. Said to be as its
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
	names,
	trying,
	onEditToken,
}: {
	answer: Ready;
	name: string;
	version: { branch: string; commit: string };
	byPath: ReadonlyMap<string, DesignToken>;
	names: ReadonlyMap<string, string>;
	trying: Trying;
	onEditToken: (token: DesignToken) => void;
}) => {
	const { values } = answer;
	// Light until the other is chosen, as a prototype opens: the same first sight for everyone.
	const [mode, setMode] = useState<Theme>(DEFAULT_THEME);
	const [editing, setEditing] = useState<{ property: ValueProperty; cell: ValueCell } | null>(null);
	const tried = (property: ValueProperty) => (cell: ValueCell) => trying.tried.get(triedId(property, cell))?.value ?? null;
	const open = (property: ValueProperty) => (cell: ValueCell) => {
		const token = cell.kind === 'token' && cell.tokens.length === 1 ? byPath.get(cell.tokens[0] as string) : undefined;
		if (token) onEditToken(token);
		else setEditing({ property, cell });
	};
	const tokenName = (path: string) => {
		const t = byPath.get(path);
		return t ? labelOf(t) : path;
	};
	const others = (path: string) => (answer.sharedWith[path] ?? []).map((f) => names.get(f) ?? f);
	return (
		<section aria-label="Values" className="aside-section">
			<div className="aside-heading">
				<h2 className="aside-title">Values</h2>
				{values.state === 'read' && <Toggle label="Values in" options={MODES} value={mode} onChange={setMode} />}
			</div>
			{values.state === 'failed' ? (
				<p className="quiet">Its values could not be read: {values.error}</p>
			) : values.state !== 'read' ? (
				<p className="quiet">{WHY_NO_COLOR[values.state](name)}</p>
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
							<Row key={row.property} row={row} name={tokenName} others={others} tried={tried(row.property)} onOpen={open(row.property)} />
						))
					)}
				</>
			)}
			{editing && (
				<ValueEditor
					property={editing.property}
					cell={editing.cell}
					tried={tried(editing.property)(editing.cell)}
					onTry={(value) =>
						trying.onTry(
							triedId(editing.property, editing.cell),
							value === null ? null : { property: editing.property, value, targets: editing.cell.targets },
						)
					}
					onClose={() => setEditing(null)}
				/>
			)}
		</section>
	);
};
