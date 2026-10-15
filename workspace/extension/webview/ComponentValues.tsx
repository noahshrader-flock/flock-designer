import type { ComponentTokens, DesignToken, ValueCell, ValueProperty, ValueRow } from '../../src/shared/contract';
import { labelOf } from '../../src/shared/tokens';
import { MOST_LISTED, sharedWith } from '../../src/renderer/useComponentTokens';
import { Disclosure } from './ui/Disclosure';
import { Swatch } from './ui/Swatch';

type Ready = Extract<ComponentTokens, { state: 'ready' }>;

/** How each property is named on its row. */
const NAMES: Record<ValueProperty, string> = {
	height: 'Height',
	padding: 'Padding',
	radius: 'Radius',
	gap: 'Gap',
	fontSize: 'Font size',
	background: 'Background',
	text: 'Text',
	border: 'Border',
};
const COLORS: ReadonlySet<ValueProperty> = new Set(['background', 'text', 'border']);
/** A colour that draws nothing (clear, or no border), as the analysis says it: shown with no swatch, and nothing said of what it is. */
const NONE = 'none';

/** What a value is, said: the token it is with the other components that share it, or the component's own, or why neither. */
const kindOf = (cell: ValueCell, name: (path: string) => string, others: (path: string) => string[]): { says: string; why?: string } => {
	const tokens = cell.tokens.map((p) => `${name(p)} · ${sharedWith(others(p))}`).join('; ');
	if (cell.kind === 'token') return { says: tokens };
	if (cell.kind === 'mixed') return { says: `Partly ${cell.tokens.map(name).join(', ')}, partly its own` };
	if (cell.kind === 'own') return { says: 'Its own', why: 'Set in the component itself: no token gives it.' };
	if (cell.kind === 'derived')
		return { says: 'Worked out from a token', why: 'It changes with the tokens, but is none of them: a shade, or a size that grows with one.' };
	return { says: 'Not checked', why: 'No token of this kind is marked when the stories are drawn, so whether it is one is not known.' };
};

/** One value: its variant, its value (a colour with its swatch), and, when the row's values are not all one kind, what it is. */
const Cell = ({ cell, color, note }: { cell: ValueCell; color: boolean; note: { says: string; why?: string } | null }) => (
	<li data-value-cell className="token" title={`${cell.instances} drawn`}>
		<span className="token-line">
			{cell.variant !== null && <span className="value-variant">{cell.variant}</span>}
			{color && cell.value !== NONE && <Swatch value={cell.value} />}
			<span className="value-drawn">{cell.value}</span>
			{note && cell.value !== NONE && (
				<span className="token-uses" data-value-kind={cell.kind} title={note.why}>
					{note.says}
				</span>
			)}
		</span>
	</li>
);

/** A property's row: its name and what tells its values apart, its values, and what they are, once when they are all one kind. */
const Row = ({ row, name, others }: { row: ValueRow; name: (path: string) => string; others: (path: string) => string[] }) => {
	const first = row.cells[0] as ValueCell;
	const same = row.cells.every((c) => c.kind === first.kind && c.tokens.join() === first.tokens.join());
	const shared = same ? kindOf(first, name, others) : null;
	const color = COLORS.has(row.property);
	const cell = (c: ValueCell) => <Cell key={`${c.variant}|${c.value}`} cell={c} color={color} note={same ? null : kindOf(c, name, others)} />;
	return (
		<div data-value-row={row.property} className="token-group">
			<h3 className="token-group-name value-row-name">
				<span>
					{NAMES[row.property]}
					{row.by !== null && <span className="quiet"> · by {row.by}</span>}
				</span>
				{shared && (
					<span className="token-uses" data-value-kind={first.kind} title={shared.why}>
						{shared.says}
					</span>
				)}
			</h3>
			<ul className="tokens">{row.cells.slice(0, MOST_LISTED).map(cell)}</ul>
			{row.cells.length > MOST_LISTED && (
				<Disclosure label={`Show ${row.cells.length - MOST_LISTED} more`}>
					<ul className="tokens">{row.cells.slice(MOST_LISTED).map(cell)}</ul>
				</Disclosure>
			)}
		</div>
	);
};

/**
 * Values (Phase 1 of adjusting a component): what each instance of the component its stories draw measures, by property
 * and by variant, and whether each is a token's, shared with which other components, or its own. Said to be as its
 * stories draw it, in light, on the version of the design system shown, so it is never taken for every use in a product.
 */
export const ComponentValues = ({
	answer,
	name,
	version,
	byPath,
	names,
}: {
	answer: Ready;
	name: string;
	version: { branch: string; commit: string };
	byPath: ReadonlyMap<string, DesignToken>;
	names: ReadonlyMap<string, string>;
}) => {
	const { values } = answer;
	// A token as the panel names it, without a word twice ("Radius", not "Radius radius").
	const tokenName = (path: string) => {
		const t = byPath.get(path);
		return t ? labelOf(t).replace(/\b(\w+) \1\b/gi, '$1') : path;
	};
	const others = (path: string) => (answer.sharedWith[path] ?? []).map((f) => names.get(f) ?? f);
	return (
		<section aria-label="Values" className="aside-section">
			<h2 className="aside-title">Values</h2>
			{values.state === 'no-component' ? (
				<p className="quiet">
					Its stories do not say which component they are of (`component` in their default export), so its values cannot be read.
				</p>
			) : values.state === 'none-drawn' ? (
				<p className="quiet">Its stories draw no {name}, so its values cannot be read.</p>
			) : (
				<>
					<p className="quiet" data-values-from>
						As its stories draw it, in light: {values.instances} {values.instances === 1 ? 'instance' : 'instances'}, on {version.branch} at{' '}
						{version.commit.slice(0, 7)}.
					</p>
					{values.rows.map((row) => (
						<Row key={row.property} row={row} name={tokenName} others={others} />
					))}
				</>
			)}
		</section>
	);
};
