import { useMemo } from 'react';
import type { DesignToken } from '../../src/shared/contract';
import { contrastPartner, contrastRatio, isForeground, labelOf, nameOf, semanticTable, type SemanticRow } from '../../src/shared/tokens';
import { textContrast } from '../../src/shared/wcag';
import { opacity, useTokenChanges } from '../../src/renderer/tokenChanges';
import { Icon } from './ui/Icon';
import { Swatch } from './ui/Swatch';

/** What a value says: what it points at (`pineGreen 50`, and its opacity), or its own color when it points at nothing. */
const reads = (token: DesignToken, target: DesignToken | undefined): string =>
	target ? `${nameOf(target)}${token.ref?.alpha ? ` at ${opacity(token.ref.alpha)}` : ''}` : token.value;

/**
 * One theme's value of a role, as the app's (`SemanticColors`): its color as a swatch, centered under its theme, what it
 * points at in its tooltip and said to assistive technology, its hex left to its control. Pressing it opens its control,
 * so a change is always to one theme's token. Marked when changed, and when its contrast is below the target.
 */
const ThemeValue = ({ token, onEdit }: { token: DesignToken; onEdit: (token: DesignToken) => void }) => {
	const changes = useTokenChanges();
	const target = changes.target(token);
	const edited = changes.isChanged(token);
	const partner = isForeground(token) ? undefined : contrastPartner(token, changes.shown);
	const ratio = partner ? contrastRatio(token.value, partner.value) : null;
	const flagged = ratio !== null && textContrast(ratio, changes.accessibility).flag;
	const says = reads(token, target);
	return (
		<span data-token={token.path} data-changed={edited || undefined} className="theme-cell">
			<button
				type="button"
				className="theme-value"
				aria-label={`Change ${labelOf(token)}`}
				aria-description={says}
				title={says}
				onClick={() => onEdit(token)}
			>
				<Swatch value={token.value} />
				{flagged && <Icon name="warning" className="theme-flag" />}
				{edited && <span data-changed-mark className="theme-changed" aria-label="Changed" />}
			</button>
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
 * The semantic colors as the app has them (the Color tokens plan): a row for each role's variant, a column for each theme
 * the design system has (Light, Dark, or more), each value a swatch that opens its own control. Roles are under their set;
 * a role whose name is its set is a plain row, with no heading to say it twice.
 */
export const SemanticColors = ({ tokens, onEdit }: { tokens: DesignToken[]; onEdit: (token: DesignToken) => void }) => {
	const table = useMemo(() => semanticTable(tokens), [tokens]);
	return (
		<>
			{table.flat.length > 0 && <Rows rows={table.flat} themes={table.themes} onEdit={onEdit} />}
			{table.sets.map(({ set, rows }) => (
				<Rows key={set} title={set} rows={rows} themes={table.themes} onEdit={onEdit} />
			))}
		</>
	);
};
