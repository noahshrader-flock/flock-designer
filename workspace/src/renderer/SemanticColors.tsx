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
 * each theme the library has (Light, Dark, or more), each value a swatch, centered, with what it points at and its hex in a
 * tooltip. **Each
 * theme's value is its own button** that opens its own control (`TokenEditor`); the row, and the role's name, open nothing,
 * so a change is always to one theme's token. A role a theme does not have is a dash. Roles are in groups, open until
 * closed, as every list of groups is; a role whose name is its set is a plain row, with no group to say it twice.
 */

/** The width of the column of names: the same on every row, and on the header over them, so the themes line up. */
const NAME = 'w-22 shrink-0';

/** What a value points at (`pineGreen 50`, and its opacity), when it points at something; and what it resolves to, its hex. */
const reads = (token: DesignToken, target: DesignToken | undefined): { points: string | null; hex: string } => ({
	points: target ? `${nameOf(target)}${token.ref?.alpha ? ` at ${opacity(token.ref.alpha)}` : ''}` : null,
	hex: token.value,
});

/**
 * One theme's value of a role: its color as a swatch, large enough to compare Light with Dark at a glance and bordered so a
 * light one shows on the panel, centered under its theme. What it points at and its hex are in a tooltip, on hover and on
 * keyboard focus, and said to assistive technology; pressing it opens its control. Marked when it has been changed, and when
 * its contrast is below the target, as small badges on its corner.
 */
const ThemeValue = ({ token }: { token: DesignToken }) => {
	const changes = useTokenChanges();
	const target = changes.target(token);
	const edited = changes.isChanged(token);
	const partner = isForeground(token) ? undefined : contrastPartner(token, changes.shown);
	const ratio = partner ? contrastRatio(token.value, partner.value) : null;
	const flagged = ratio !== null && textContrast(ratio, changes.accessibility).flag;
	const { points, hex } = reads(token, target);
	return (
		<div data-token={token.path} data-changed={edited || undefined} className="flex min-w-0 flex-1 justify-center">
			<TokenEditorPopover
				token={token}
				tip={
					<>
						{points && <span>{points}</span>}
						<span className="font-mono">{hex}</span>
					</>
				}
			>
				<button
					type="button"
					aria-label={`Change ${labelOf(token)}`}
					aria-description={points ? `${points} · ${hex}` : hex}
					className="hover:bg-muted/50 data-[state=open]:bg-muted relative rounded-md p-0.5"
				>
					<Swatch value={token.value} size="h-8 w-10" />
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
				<span key={i} aria-hidden className="text-muted-foreground/60 min-w-0 flex-1 text-center text-xs">
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
					<span key={theme} data-theme-heading className="min-w-0 flex-1 truncate text-center">
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
