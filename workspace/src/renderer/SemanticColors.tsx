import { TriangleAlertIcon } from 'lucide-react';
import { useMemo } from 'react';
import type { DesignToken } from '../shared/contract';
import { labelOf, pointsAt, rowContrast, semanticTable, type SemanticRow } from '../shared/tokens';
import { GroupTrigger, STICKY_GROUP_HEADER, useClosedGroups } from './GroupAccordion';
import { Swatch } from './Swatch';
import { Button } from './ui/button';
import { TokenEditorPopover } from './TokenEditor';
import { useTokenChanges } from './tokenChanges';
import { Accordion, AccordionContent, AccordionItem } from './ui/accordion';
import { cn } from '@/lib/utils';

/**
 * The semantic colors, as a library's roles by theme (the Color tokens plan): a row for each role's variant, a column for
 * each theme the library has (Light, Dark, or more), each value a small square swatch, centered, with what it points at in a
 * tooltip. **Each theme's value is its own button** that opens its own control (`TokenEditor`); the row, and the role's name, open nothing,
 * so a change is always to one theme's token. A role a theme does not have is a dash. Roles are in groups, open until
 * closed, as every list of groups is; a role whose name is its set is a plain row, with no group to say it twice.
 */

/**
 * The columns: the names take the room there is, and each theme's is only as wide as its swatch needs (the same on every row
 * and on its heading, so they line up), together at the right, so a long name is not cut to give a swatch room it does not use.
 */
const NAME = 'min-w-0 flex-1';
const THEME = 'w-14 shrink-0';

/**
 * One theme's value of a role: its color as a small square swatch in the app's small icon button, centered under its theme
 * and bordered so a light one shows on the panel, so Light and Dark can be compared at a glance. What it points at is in a
 * tooltip, on hover and on keyboard focus, and said to assistive technology: not its hex, which its popover has. Pressing it
 * opens its control. Marked when it has been changed, and when its contrast is below the target, as badges on its corner.
 */
const ThemeValue = ({ token }: { token: DesignToken }) => {
	const changes = useTokenChanges();
	const target = changes.target(token);
	const edited = changes.isChanged(token);
	const flagged = rowContrast(token, changes)?.flag === true;
	// What it points at, or its own color when it points at nothing.
	const says = target ? pointsAt(token, target) : token.value;
	return (
		<div data-token={token.path} data-changed={edited || undefined} className={cn(THEME, 'flex justify-center')}>
			<TokenEditorPopover token={token} tip={<span>{says}</span>}>
				<Button
					variant="ghost"
					size="icon-sm"
					aria-label={`Change ${labelOf(token)}`}
					aria-description={says}
					className="data-[state=open]:bg-muted relative"
				>
					<Swatch value={token.value} size="size-5" />
					{(flagged || edited) && (
						<span className="absolute top-0 right-0 flex items-center gap-0.5">
							{flagged && (
								<span className="bg-card rounded-full p-px">
									<TriangleAlertIcon aria-label="Contrast below the target" className="text-warning size-3" />
								</span>
							)}
							{edited && <span data-changed-mark aria-label="Changed" className="bg-primary ring-card size-2 rounded-full ring-2" />}
						</span>
					)}
				</Button>
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
				<span key={i} aria-hidden className={cn(THEME, 'text-muted-foreground/60 text-center text-xs')}>
					—
				</span>
			),
		)}
	</li>
);

/** A section's rows, under the themes' names: said again in every section, so each reads on its own wherever the list is scrolled to. */
const Rows = ({ rows, themes }: { rows: SemanticRow[]; themes: string[] }) => (
	<>
		<div data-theme-headings className="text-muted-foreground flex items-center gap-1 pb-2 text-xs">
			<span className={NAME} />
			{themes.map((theme) => (
				<span key={theme} data-theme-heading className={cn(THEME, 'truncate text-center')}>
					{theme}
				</span>
			))}
		</div>
		<ul className="flex flex-col">
			{rows.map((row) => (
				<Row key={`${row.set}/${row.name}`} row={row} />
			))}
		</ul>
	</>
);

export const SemanticColors = ({ tokens }: { tokens: DesignToken[] }) => {
	const closed = useClosedGroups();
	const table = useMemo(() => semanticTable(tokens), [tokens]);
	return (
		<div className="flex flex-col gap-1">
			{table.flat.length > 0 && <Rows rows={table.flat} themes={table.themes} />}
			{table.sets.length > 0 && (
				<Accordion {...closed.accordion(table.sets.map((s) => s.set))}>
					{table.sets.map(({ set, rows }) => (
						<AccordionItem key={set} value={set} data-token-group className={STICKY_GROUP_HEADER}>
							<GroupTrigger name={set} count={rows.length} />
							<AccordionContent>
								<Rows rows={rows} themes={table.themes} />
							</AccordionContent>
						</AccordionItem>
					))}
				</Accordion>
			)}
		</div>
	);
};
