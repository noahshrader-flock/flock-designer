import type { DesignToken } from '../../src/shared/contract';
import { rowContrast, semanticTable, type SemanticRow } from '../../src/shared/tokens';
import { useTokenChanges } from './hooks/tokenChanges';
import type { Theme } from '../../src/shared/prototypeTheme';
import { ColorDot, tokenDot } from './ui/ColorDot';
import { ModeIcon } from './ui/ModeIcon';
import { ValueList } from './ui/ValueItem';

/**
 * One theme's value of a role, as `SemanticColors` draws it: its color as a dot (`ColorDot`), centered under its theme, its
 * name as its tooltip, its hex left to its control. Pressing it opens its control, so a change is always to one theme's
 * token. Marked when changed, and when its contrast is below the target.
 */
const ThemeValue = ({ token, onEdit }: { token: DesignToken; onEdit: (token: DesignToken) => void }) => {
	const changes = useTokenChanges();
	const edited = changes.isChanged(token);
	const flagged = rowContrast(token, changes)?.flag === true;
	return (
		<span data-token={token.path} data-changed={edited || undefined} className="theme-cell">
			<ColorDot
				{...tokenDot(token)}
				onPress={() => onEdit(token)}
				{...(edited ? { mark: 'Changed' as const } : {})}
				{...(flagged ? { flag: 'Contrast is too low' } : {})}
			/>
		</span>
	);
};

/**
 * A role's variant, as a row of the table of roles and themes: its name, and its value in each theme, under the theme's
 * heading; a dash where a theme has none.
 */
const RoleRow = ({ row, onEdit }: { row: SemanticRow; onEdit: (token: DesignToken) => void }) => (
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

/** The themes that have an icon, as the panel's own mode switch has them (the sun for light, the moon for dark). */
const MODES: Record<string, Theme> = { light: 'light', dark: 'dark' };

/**
 * A theme's heading over its column: **its icon**, the sun for Light and the moon for Dark, as the mode switch has them;
 * named by the theme, in its tooltip and to assistive technology. A theme that is neither is its name, cut short to its column,
 * with the whole name in its tooltip.
 */
const ThemeHeading = ({ theme }: { theme: string }) => {
	const mode = MODES[theme.toLowerCase()];
	return mode ? (
		<span data-theme-heading role="img" aria-label={theme} title={theme} className="theme-cell">
			<ModeIcon mode={mode} size="xs" />
		</span>
	) : (
		<span data-theme-heading title={theme} className="theme-cell">
			{theme}
		</span>
	);
};

/** A set's rows under the themes' icons, said again in every set so each reads on its own wherever it is scrolled to. */
const Rows = ({ title, rows, themes, onEdit }: { title?: string; rows: SemanticRow[]; themes: string[]; onEdit: (token: DesignToken) => void }) => (
	<div className="theme-set" {...(title ? { 'data-token-set': title } : {})}>
		<div data-theme-headings className="theme-row theme-headings">
			<span className="theme-name">{title}</span>
			{themes.map((theme) => (
				<ThemeHeading key={theme} theme={theme} />
			))}
		</div>
		<ValueList label={title ?? 'Roles'}>
			{rows.map((row) => (
				<RoleRow key={`${row.set}/${row.name}`} row={row} onEdit={onEdit} />
			))}
		</ValueList>
	</div>
);

/**
 * The semantic colors (the Color tokens plan): a row for each role's variant, a column for each theme
 * the design system has (Light, Dark, or more, headed by the sun and the moon), each value a dot that opens its own control. Roles are under their set;
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
