import type { DesignToken } from '../../src/shared/contract';
import { colorSays, labelOf, rowContrast, semanticTable, type SemanticRow } from '../../src/shared/tokens';
import { useTokenChanges } from '../../src/renderer/tokenChanges';
import { ColorDot } from './ui/ColorDot';

/**
 * One theme's value of a role, as `SemanticColors` draws it: its color as a dot (`ColorDot`), centered under its theme, its
 * name and what it points at in its tooltip, its hex left to its control. Pressing it opens its control, so a change is
 * always to one theme's token. Marked when changed, and when its contrast is below the target.
 */
const ThemeValue = ({ token, onEdit }: { token: DesignToken; onEdit: (token: DesignToken) => void }) => {
	const changes = useTokenChanges();
	const target = changes.target(token);
	const edited = changes.isChanged(token);
	const flagged = rowContrast(token, changes)?.flag === true;
	return (
		<span data-token={token.path} data-changed={edited || undefined} className="theme-cell">
			<ColorDot
				value={token.value}
				says={colorSays(token, target)}
				name={labelOf(token)}
				onPress={() => onEdit(token)}
				{...(edited ? { mark: 'Changed' as const } : {})}
				{...(flagged ? { flag: 'Contrast is too low' } : {})}
			/>
		</span>
	);
};

/** A role's variant: its name, and its value in each theme, under the theme's heading; a dash where a theme has none. */
const Row = ({ row, onEdit }: { row: SemanticRow; onEdit: (token: DesignToken) => void }) => (
	<li data-token-row={row.name} className="theme-row">
		<span className="theme-name" title={row.name}>
			{row.name}
		</span>
		{row.cells.map((token, i) =>
			token ? (
				<ThemeValue key={token.path} token={token} onEdit={onEdit} />
			) : (
				<span key={i} aria-hidden="true" className="theme-cell theme-none">
					—
				</span>
			),
		)}
	</li>
);

/** A set's rows under the themes' names, said again in every set so each reads on its own wherever it is scrolled to. */
const Rows = ({ title, rows, themes, onEdit }: { title?: string; rows: SemanticRow[]; themes: string[]; onEdit: (token: DesignToken) => void }) => (
	<div className="theme-set" {...(title ? { 'data-token-set': title } : {})}>
		<div data-theme-headings className="theme-row theme-headings">
			<span className="theme-name token-set-name">{title}</span>
			{themes.map((theme) => (
				<span key={theme} data-theme-heading className="theme-cell">
					{theme}
				</span>
			))}
		</div>
		<ul className="tokens" aria-label={title ?? 'Roles'}>
			{rows.map((row) => (
				<Row key={`${row.set}/${row.name}`} row={row} onEdit={onEdit} />
			))}
		</ul>
	</div>
);

/**
 * The semantic colors (the Color tokens plan): a row for each role's variant, a column for each theme
 * the design system has (Light, Dark, or more), each value a swatch that opens its own control. Roles are under their set;
 * a role whose name is its set is a plain row, with no heading to say it twice.
 */
export const SemanticColors = ({ tokens, onEdit }: { tokens: DesignToken[]; onEdit: (token: DesignToken) => void }) => {
	const table = semanticTable(tokens);
	return (
		<>
			{table.flat.length > 0 && <Rows rows={table.flat} themes={table.themes} onEdit={onEdit} />}
			{table.sets.map(({ set, rows }) => (
				<Rows key={set} title={set} rows={rows} themes={table.themes} onEdit={onEdit} />
			))}
		</>
	);
};
