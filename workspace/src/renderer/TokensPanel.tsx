import { type ReactNode, useMemo, useState } from 'react';
import type { DesignToken, DesignTokens } from '../shared/contract';
import { byPrimitive, inOrder, isEditable } from '../shared/primitives';
import { contrastPartner, contrastRatio, isForeground } from '../shared/tokens';
import { ChangedTokens, ContrastNote, Swatch, TokenEditor } from './TokenEditor';
import type { TokenBranchControls } from './useTokenBranch';
import { labelOf, nameOf, opacity, useTokenChanges } from './tokenChanges';
import { GroupTrigger, useClosedGroups } from './GroupAccordion';
import { Accordion, AccordionContent, AccordionItem } from './ui/accordion';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { SearchField } from './SearchField';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';

/**
 * The library's tokens, in the panel at the right of the Design System tab (T2 and T3 of the design system plan): the
 * list T1 reads, in line tabs by category (Color, Spacing, Shape: the reader says which each token is on, so a
 * category the library gains is a tab with nothing else changed), each tab with its own search. **One accordion at most:**
 * a tab with several groups (Color has Tones, Light and Dark) has them as an accordion, open until closed; a set is
 * never closed up behind a second one, but a plain heading over its tokens, each a swatch at the left and its value at the
 * right. A tab with one group shows its sets straight away. The tabs are the panel's (`Tabs variant="line"`): edge to edge on a
 * bottom border, the padding on the content under them. What the library has that is not read is not said here: it is
 * a button in the design system's row (`TokenProblems`), so the panel keeps its room.
 *
 * **A change is tried here** (T3): a row opens its token's control (`TokenEditor`), every row shows the tokens as changed,
 * a pair's contrast is on its row, and what has been changed is listed above the tabs with its resets. The change is
 * the tab's, given to every panel that shows tokens (`useTokenChanges`): the component page builds its previews with it.
 */

const setKey = (t: DesignToken) => `${t.group}/${t.set}`;

/** What a token is, in words, for the search to look through: what it points at too. */
const searchable = (t: DesignToken) => [t.path, t.group, t.set, t.name, t.value, t.ref?.path ?? ''].join(' ').toLowerCase();

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
			<span className={`min-w-0 truncate ${edited ? 'font-medium' : ''}`}>{token.name}</span>
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
				<Popover>
					<PopoverTrigger asChild>
						<button type="button" aria-label={`Change ${labelOf(token)}`} className={`hover:bg-muted/50 data-[state=open]:bg-muted ${ROW}`}>
							{content}
						</button>
					</PopoverTrigger>
					<PopoverContent side="left" align="start" className="w-72">
						<TokenEditor token={token} />
					</PopoverContent>
				</Popover>
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

/**
 * A group's header stays at the top of the panel's scroll for as long as the group's tokens are shown, and is pushed off by
 * the next group's, as a section header is on iOS: it sticks within its own item, so it leaves when the item does. It
 * sticks at 0, flush under the tabs, because the scrolling content has no padding above it (`pt-0` below; the tab's own
 * `pt-4` is what is scrolled), so nothing shows above it.
 */
const STICKY_HEADER = '[&>h3]:bg-card [&>h3]:sticky [&>h3]:top-0 [&>h3]:z-10';

/** One category's tab: its own search, then its tokens. What is typed is the panel's, so it is there when the tab is back. */
const TokensTab = ({
	category,
	tokens,
	query,
	onQuery,
}: {
	category: string;
	tokens: DesignToken[];
	query: string;
	onQuery: (query: string) => void;
}) => {
	const closed = useClosedGroups();
	const q = query.trim().toLowerCase();
	const shown = useMemo(() => (q === '' ? tokens : tokens.filter((t) => searchable(t).includes(q))), [tokens, q]);

	const groups = inOrder(shown, (t) => t.group);
	const names = groups.map(([group]) => group);
	return (
		<div className="flex flex-col gap-3 pt-4">
			<SearchField label={`Search ${category.toLowerCase()}`} value={query} onChange={onQuery} />
			{shown.length === 0 ? (
				<p className="text-muted-foreground text-sm">No token matches.</p>
			) : groups.length === 1 ? (
				// One group would say the tab's own name again, so its sets are shown directly.
				<Sets tokens={shown} />
			) : (
				<Accordion {...closed.accordion(names)}>
					{groups.map(([group, inGroup]) => (
						<AccordionItem key={group} value={group} data-token-group className={STICKY_HEADER}>
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
			<Tabs variant="line" value={active} onValueChange={setCurrent}>
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
							query={queries[category] ?? ''}
							onQuery={(query) => setQueries((all) => ({ ...all, [category]: query }))}
						/>
					</TabsContent>
				))}
			</Tabs>
		</>
	);
};
