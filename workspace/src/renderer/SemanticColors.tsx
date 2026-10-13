import { TriangleAlertIcon } from 'lucide-react';
import { useMemo } from 'react';
import type { DesignToken } from '../shared/contract';
import { contrastPartner, contrastRatio, isForeground, semanticTable, type SemanticRow } from '../shared/tokens';
import { textContrast } from '../shared/wcag';
import { GroupTrigger, STICKY_GROUP_HEADER, useClosedGroups } from './GroupAccordion';
import { Swatch } from './Swatch';
import { TokenEditorPopover } from './TokenEditor';
import { labelOf, nameOf, opacity, useTokenChanges } from './tokenChanges';
import { Accordion, AccordionContent, AccordionItem } from './ui/accordion';
import { cn } from '@/lib/utils';

/**
 * The semantic colors, as a library's roles by theme (the Color tokens plan): a row for each role's variant, a column for
 * each theme the library has (Light, Dark, or more), each value its swatch and what it points at, not its hex. **Each
 * theme's value is its own button** that opens its own control (`TokenEditor`); the row, and the role's name, open nothing,
 * so a change is always to one theme's token. A role a theme does not have is a dash. Roles are in groups, open until
 * closed, as every list of groups is; a role whose name is its set is a plain row, with no group to say it twice.
 */

/** The width of the column of names: the same on every row, and on the header over them, so the themes line up. */
const NAME = 'w-22 shrink-0';

/** What a value says: what it points at (`pineGreen 50`), or its own color when it points at nothing; and its opacity, apart. */
const reads = (token: DesignToken, target: DesignToken | undefined): { says: string; alpha: string | null } => ({
	says: target ? nameOf(target) : token.value,
	alpha: target && token.ref?.alpha ? opacity(token.ref.alpha) : null,
});

/** One theme's value of a role: its swatch and what it points at, pressed to change it, marked when it has been changed. */
const ThemeValue = ({ token }: { token: DesignToken }) => {
	const changes = useTokenChanges();
	const target = changes.target(token);
	const edited = changes.isChanged(token);
	const partner = isForeground(token) ? undefined : contrastPartner(token, changes.shown);
	const ratio = partner ? contrastRatio(token.value, partner.value) : null;
	const flagged = ratio !== null && textContrast(ratio, changes.accessibility).flag;
	const { says, alpha } = reads(token, target);
	return (
		<div
			data-token={token.path}
			data-changed={edited || undefined}
			title={`${says}${alpha ? ` at ${alpha}` : ''} · ${token.value}`}
			className="min-w-0 flex-1"
		>
			<TokenEditorPopover token={token}>
				<button
					type="button"
					aria-label={`Change ${labelOf(token)}`}
					className="hover:bg-muted/50 data-[state=open]:bg-muted flex w-full items-center gap-1.5 rounded-md px-1 py-1 text-left text-xs"
				>
					<Swatch value={token.value} />
					{/* The opacity is kept when the name is cut to fit: it is what tells two values of one color apart. */}
					<span className={cn('text-muted-foreground flex min-w-0 items-baseline gap-1', edited && 'text-foreground font-medium')}>
						<span className="truncate">{says}</span>
						{alpha && <span className="shrink-0">{` · ${alpha}`}</span>}
					</span>
					{flagged && <TriangleAlertIcon aria-label="Contrast below the target" className="text-warning size-3 shrink-0" />}
					{edited && <span data-changed-mark aria-label="Changed" className="bg-primary ml-auto size-1.5 shrink-0 rounded-full" />}
				</button>
			</TokenEditorPopover>
		</div>
	);
};

/** A role's variant: its name, and its value in each theme, aligned under the theme's heading. */
const Row = ({ row }: { row: SemanticRow }) => (
	<li data-token-row={row.name} className="flex items-center gap-1">
		<span className={cn(NAME, 'truncate pr-1 text-sm')} title={row.name}>
			{row.name}
		</span>
		{row.cells.map((token, i) =>
			token ? (
				<ThemeValue key={token.path} token={token} />
			) : (
				<span key={i} aria-hidden className="text-muted-foreground/60 min-w-0 flex-1 px-1 text-xs">
					—
				</span>
			),
		)}
	</li>
);

const Rows = ({ rows }: { rows: SemanticRow[] }) => (
	<ul className="flex flex-col">
		{rows.map((row) => (
			<Row key={`${row.set}/${row.name}`} row={row} />
		))}
	</ul>
);

export const SemanticColors = ({ tokens }: { tokens: DesignToken[] }) => {
	const closed = useClosedGroups();
	const table = useMemo(() => semanticTable(tokens), [tokens]);
	return (
		<div className="flex flex-col gap-1">
			<div className="text-muted-foreground flex items-center gap-1 text-xs">
				<span className={NAME}>Token</span>
				{table.themes.map((theme) => (
					<span key={theme} data-theme-heading className="min-w-0 flex-1 truncate px-1">
						{theme}
					</span>
				))}
			</div>
			{table.flat.length > 0 && <Rows rows={table.flat} />}
			{table.sets.length > 0 && (
				<Accordion {...closed.accordion(table.sets.map((s) => s.set))}>
					{table.sets.map(({ set, rows }) => (
						<AccordionItem key={set} value={set} data-token-group className={STICKY_GROUP_HEADER}>
							<GroupTrigger name={set} count={rows.length} />
							<AccordionContent>
								<Rows rows={rows} />
							</AccordionContent>
						</AccordionItem>
					))}
				</Accordion>
			)}
		</div>
	);
};
