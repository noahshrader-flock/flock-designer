import type { DesignToken } from '../../src/shared/contract';
import { rowContrast, semanticTable, type SemanticRow } from '../../src/shared/tokens';
import { useTokenChanges } from './hooks/tokenChanges';
import type { Theme } from '../../src/shared/prototypeTheme';
import { ColorDot } from '../../src/ui/ColorDot';
import { tokenDot } from './tokenDot';
import { ModeIcon } from '../../src/ui/ModeIcon';
import { ValueList } from '../../src/ui/ValueItem';

/** Each dot is one theme's token, so a change is always to one theme. */
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

const MODES: Record<string, Theme> = { light: 'light', dark: 'dark' };

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

/** The themes' icons said again in every set, so each reads on its own wherever it is scrolled to. */
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
