import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import type { DesignToken, DesignTokens } from '../shared/contract';
import { PRIMITIVES, byPrimitive, inOrder, isEditable } from '../shared/primitives';
import { contrastPartner, contrastRatio, familyOf, isForeground } from '../shared/tokens';
import { ChangedTokens, ContrastNote, TokenEditorPopover } from './TokenEditor';
import { Swatch } from './Swatch';
import type { TokenBranchControls } from './useTokenBranch';
import { labelOf, nameOf, opacity, useTokenChanges } from './tokenChanges';
import { GroupTrigger, STICKY_GROUP_HEADER, useClosedGroups } from './GroupAccordion';
import { Accordion, AccordionContent, AccordionItem } from './ui/accordion';
import { SearchField } from './SearchField';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { cn } from '@/lib/utils';
import { NoMatches } from './NoMatches';
import { SemanticColors } from './SemanticColors';
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group';
import { PaletteIcon, TagsIcon } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

/**
 * The library's tokens, in the panel at the right of the Design System tab (T2 and T3 of the design system plan): the
 * list T1 reads, in line tabs by category (Color, Spacing, Shape: the reader says which each token is on, so a
 * category the library gains is a tab with nothing else changed), each tab with its own search. **One accordion at most:**
 * a tab with several groups (Color has Tones, Light and Dark) has them as an accordion, open until closed; a set is
 * never closed up behind a second one, but a plain heading over its tokens, each a swatch at the left and its value at the
 * right. A tab with one group shows its sets straight away. **Color has two views** (`SemanticColors`, the default, and the
 * palette behind it): the roles by theme, each theme's value its own control; and the families the roles point into, as the
 * other tabs are. A library with only one of them has only that. The tabs are the app's line tabs (`Tabs variant="line"`), the same strip as
 * the Design System's own, inset as this panel's content is. What the library has that is not read is not said here: it is
 * a button in the design system's row (`TokenProblems`), so the panel keeps its room.
 *
 * **A change is tried here** (T3): a row opens its token's control (`TokenEditor`), every row shows the tokens as changed,
 * a pair's contrast is on its row, and what has been changed is listed above the tabs with its resets. The change is
 * the tab's, given to every panel that shows tokens (`useTokenChanges`): the component page builds its previews with it.
 */

const setKey = (t: DesignToken) => `${t.group}/${t.set}`;

/** What a token is, in words, for the search to look through: what it points at too, as it is named on screen (`pineGreen 50`). */
const searchable = (t: DesignToken, target?: DesignToken) =>
	[t.path, t.group, t.set, t.name, t.value, t.ref?.path ?? '', target ? nameOf(target) : ''].join(' ').toLowerCase();

/** A row's layout: the same whether it can be pressed or not, so a row that is only shown lines up with the others. */
const ROW = '-mx-2 flex w-[calc(100%+1rem)] items-center gap-2 rounded-md px-2 py-1 text-left text-sm';

/**
 * A token's row: its swatch, name, what it points at, the contrast of its pair when it is the one read under the other,
 * and its value, as changed. Pressing it opens its control, beside the panel, over the components it changes. A token
 * that cannot be changed (`isEditable`: a font, a shadow, a breakpoint) is the same row with nothing to press.
 */
export const TokenRow = ({ token, note }: { token: DesignToken; note?: ReactNode }) => {
	const changes = useTokenChanges();
	const target = changes.target(token);
	const partner = isForeground(token) ? undefined : contrastPartner(token, changes.shown);
	const ratio = partner ? contrastRatio(token.value, partner.value) : null;
	const edited = changes.isChanged(token);
	const content = (
		<>
			{token.kind === 'color' && <Swatch value={token.value} />}
			<span className={cn('min-w-0 truncate', edited && 'font-medium')}>{token.name}</span>
			{target && (
				<span className="text-muted-foreground truncate text-xs">
					{nameOf(target)}
					{token.ref?.alpha && ` at ${opacity(token.ref.alpha)}`}
				</span>
			)}
			{ratio !== null && <ContrastNote ratio={ratio} className="shrink-0 text-xs" />}
			<span className="text-muted-foreground ml-auto shrink-0 font-mono text-xs">{token.value}</span>
			{edited && <span data-changed-mark aria-label="Changed" className="bg-primary size-1.5 shrink-0 rounded-full" />}
		</>
	);
	return (
		<li data-token={token.path} data-changed={edited || undefined} title={`${token.source.file}:${token.source.line}`}>
			{isEditable(token) ? (
				<TokenEditorPopover token={token}>
					<button type="button" aria-label={`Change ${labelOf(token)}`} className={cn('hover:bg-muted/50 data-[state=open]:bg-muted', ROW)}>
						{content}
					</button>
				</TokenEditorPopover>
			) : (
				<div className={ROW}>{content}</div>
			)}
			{note && <div className="text-muted-foreground pb-1 text-xs">{note}</div>}
		</li>
	);
};

/** The sets of a group (or of a tab with one): each its name as a heading over its tokens, all listed, each with `noteFor` its own. */
export const Sets = ({ tokens, noteFor }: { tokens: DesignToken[]; noteFor?: (token: DesignToken) => ReactNode }) => (
	<div className="flex flex-col gap-4">
		{inOrder(tokens, setKey).map(([key, inSet]) => (
			<section key={key} data-token-set aria-label={(inSet[0] as DesignToken).set} className="flex flex-col gap-1">
				<h4 data-set-name className="text-sm font-medium">
					{(inSet[0] as DesignToken).set}
				</h4>
				<ul className="flex flex-col">
					{inSet.map((t) => (
						<TokenRow key={t.path} token={t} note={noteFor?.(t)} />
					))}
				</ul>
			</section>
		))}
	</div>
);

/** The two views of a color category, as the icons that switch between them: the roles, and the palette they are made from. */
const VIEWS = [
	{ value: 'semantic', label: 'Semantic', Icon: TagsIcon },
	{ value: 'palette', label: 'Palette', Icon: PaletteIcon },
] as const;

/** The views of a category drawn as swatches: the roles by theme, and the palette they are made from. */
export type ColorView = 'semantic' | 'palette';

/** A role's variant, whichever theme it is in: what a search keeps together, so a match in one theme keeps the others' value. */
const rowKey = (t: DesignToken) => `${t.set}\u0000${t.name}`;

/**
 * The palette, as its roles are shown: each color family is a group (an accordion item, open until closed, its header sticky,
 * its steps listed under it), so Palette and Semantic read the same. A library that keeps its palette in several themes has a
 * family in each, so a group says its theme too.
 */
const PaletteFamilies = ({ tokens }: { tokens: DesignToken[] }) => {
	const closed = useClosedGroups();
	const families = inOrder(tokens, familyOf);
	const several = new Set(tokens.map((t) => t.group)).size > 1;
	return (
		<Accordion {...closed.accordion(families.map(([family]) => family))}>
			{families.map(([family, steps]) => {
				const first = steps[0] as DesignToken;
				return (
					<AccordionItem key={family} value={family} data-token-group className={STICKY_GROUP_HEADER}>
						<GroupTrigger name={several ? `${first.group} · ${first.set}` : first.set} count={steps.length} />
						<AccordionContent>
							<ul className="flex flex-col">
								{steps.map((t) => (
									<TokenRow key={t.path} token={t} />
								))}
							</ul>
						</AccordionContent>
					</AccordionItem>
				);
			})}
		</Accordion>
	);
};

/**
 * One category's tab: its own search, then its tokens. What is typed is the panel's, so it is there when the tab is back. A
 * category of colors with both roles and a palette has the two views (`view`, the panel's too); with only one, only that.
 */
const TokensTab = ({
	category,
	tokens,
	view,
	onView,
	query,
	onQuery,
}: {
	category: string;
	tokens: DesignToken[];
	view: ColorView;
	onView: (view: ColorView) => void;
	query: string;
	onQuery: (query: string) => void;
}) => {
	const closed = useClosedGroups();
	const { isPalette, target } = useTokenChanges();
	const q = query.trim().toLowerCase();
	const colors = PRIMITIVES.find((p) => p.category === category)?.drawn === 'swatches';
	const split = useMemo(
		() => (colors ? { semantic: tokens.filter((t) => !isPalette(t)), palette: tokens.filter(isPalette) } : null),
		[colors, tokens, isPalette],
	);
	const choose = split !== null && split.semantic.length > 0 && split.palette.length > 0;
	const shownView: ColorView | null = split === null ? null : choose ? view : split.semantic.length > 0 ? 'semantic' : 'palette';
	const pool = split && shownView ? split[shownView] : tokens;
	const shown = useMemo(() => {
		if (q === '') return pool;
		const found = pool.filter((t) => searchable(t, target(t)).includes(q));
		if (shownView !== 'semantic') return found;
		const rows = new Set(found.map(rowKey));
		return pool.filter((t) => rows.has(rowKey(t)));
	}, [pool, q, shownView, target]);

	const groups = inOrder(shown, (t) => t.group);
	const names = groups.map(([group]) => group);
	// Another view starts at its top: what was scrolled to in the other is somewhere else in this one.
	const top = useRef<HTMLDivElement>(null);
	useEffect(() => {
		const scroller = top.current?.closest<HTMLElement>('[data-slot="tabs-content"]');
		if (scroller) scroller.scrollTop = 0;
	}, [shownView]);
	return (
		<div ref={top} className="flex flex-col gap-3 pt-4">
			{/* The views at the left of the search, as List and Grid are on the screens that have both. */}
			<div data-color-search className="flex items-center gap-1.5">
				{choose && (
					<ToggleGroup
						type="single"
						variant="outline"
						spacing={0}
						aria-label={`${category} view`}
						value={view}
						// Pressing the one shown would unpress it, leaving none shown: it stays.
						onValueChange={(next) => (next === 'semantic' || next === 'palette') && onView(next)}
					>
						{VIEWS.map(({ value, label, Icon }) => (
							<Tooltip key={value}>
								{/* The item outside the trigger: the trigger's own data-state (open or closed) would replace the pressed one. */}
								<ToggleGroupItem value={value} aria-label={label} asChild>
									<TooltipTrigger>
										<Icon />
									</TooltipTrigger>
								</ToggleGroupItem>
								<TooltipContent side="bottom">{label}</TooltipContent>
							</Tooltip>
						))}
					</ToggleGroup>
				)}
				<SearchField label={`Search ${category.toLowerCase()}`} value={query} onChange={onQuery} className="min-w-0 flex-1" />
			</div>
			{shown.length === 0 ? (
				<NoMatches thing="token" search={query} onClear={() => onQuery('')} />
			) : shownView === 'semantic' ? (
				<SemanticColors tokens={shown} />
			) : shownView === 'palette' ? (
				<PaletteFamilies tokens={shown} />
			) : groups.length === 1 ? (
				// One group would say the tab's own name again, so its sets are shown directly.
				<Sets tokens={shown} />
			) : (
				<Accordion {...closed.accordion(names)}>
					{groups.map(([group, inGroup]) => (
						<AccordionItem key={group} value={group} data-token-group className={STICKY_GROUP_HEADER}>
							<GroupTrigger name={group} count={inGroup.length} />
							<AccordionContent>
								<Sets tokens={inGroup} />
							</AccordionContent>
						</AccordionItem>
					))}
				</Accordion>
			)}
		</div>
	);
};

export const TokensPanel = ({
	tokens,
	live,
	branch,
}: {
	tokens: DesignTokens;
	/** Whether a component is open, so a change is seen as it is made. */
	live: boolean;
	/** The branch the change is kept on, and saving and proposing it (T4, T5). */
	branch: TokenBranchControls;
}) => {
	const [current, setCurrent] = useState<string | null>(null);
	const [queries, setQueries] = useState<Record<string, string>>({});
	const [views, setViews] = useState<Record<string, ColorView>>({});
	const changes = useTokenChanges();
	const categories = useMemo(() => byPrimitive(changes.shown), [changes.shown]);

	if (tokens.source === null || categories.length === 0) {
		return (
			<>
				<div className="p-4">
					<p className="text-muted-foreground text-sm">No tokens were found in this library. Looked for {tokens.looked.join(', ')}.</p>
				</div>
			</>
		);
	}

	// A category the library no longer has is not kept: the first is shown.
	const active = categories.some(([c]) => c === current) ? (current as string) : (categories[0] as [string, DesignToken[]])[0];
	return (
		<>
			<ChangedTokens live={live} branch={branch} />
			{/* The panel's own inset, 1rem, which its content shares: the strip is the same as any other, aligned with what is under it. */}
			<Tabs variant="line" value={active} onValueChange={setCurrent} className="[--tabs-inset:1rem]">
				<TabsList>
					{categories.map(([category]) => (
						<TabsTrigger key={category} value={category}>
							{category}
						</TabsTrigger>
					))}
				</TabsList>
				{categories.map(([category, inCategory]) => (
					<TabsContent key={category} value={category} className="pt-0">
						<TokensTab
							category={category}
							tokens={inCategory}
							view={views[category] ?? 'semantic'}
							onView={(view) => setViews((all) => ({ ...all, [category]: view }))}
							query={queries[category] ?? ''}
							onQuery={(query) => setQueries((all) => ({ ...all, [category]: query }))}
						/>
					</TabsContent>
				))}
			</Tabs>
		</>
	);
};
