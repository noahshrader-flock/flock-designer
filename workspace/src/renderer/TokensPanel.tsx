import { useMemo, useState } from 'react';
import type { DesignToken, DesignTokens, TokenEdit } from '../shared/contract';
import { contrastPartner, contrastRatio, isForeground } from '../shared/tokens';
import { ChangedTokens, ContrastNote, Swatch, TokenEditor } from './TokenEditor';
import { TokenProblems } from './TokenProblems';
import { TokenChangesProvider, labelOf, nameOf, opacity, useTokenChanges, useTokenChangesFor } from './tokenChanges';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './ui/accordion';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { SearchField } from './SearchField';
import { PanelTabs, PanelTabsContent, PanelTabsList, PanelTabsTrigger } from './PanelTabs';

/**
 * The library's tokens, in the panel at the right of the Design System tab (T2 and T3 of the design system plan): the
 * list T1 reads, in line tabs by category (Color, Spacing, Shape: the reader says which each token is on, so a
 * category the library gains is a tab with nothing else changed), each tab with its own search. **One accordion at most:**
 * a tab with several groups (Color has Tones, Light and Dark) has them as an accordion, open until closed; a set is
 * never closed up behind a second one, but a plain heading over its tokens, each a swatch at the left and its value at the
 * right. A tab with one group shows its sets straight away. The tabs are the panel's (`PanelTabs`): edge to edge on a
 * bottom border, the padding on the content under them. What the library has that is not read is one alert above the
 * tabs (`TokenProblems`), its details in a dialog, so the panel keeps its room.
 *
 * **A change is tried here** (T3): a row opens its token's control (`TokenEditor`), every row shows the tokens as changed,
 * a pair's contrast is on its row, and what has been changed is listed above the tabs with its resets. The change is
 * the tab's (`edits`): the component page builds its previews with it.
 */

/** Tokens in the order they came, by `key`, keeping the first-seen order of the keys. */
const inOrder = <K extends string>(tokens: DesignToken[], key: (t: DesignToken) => K): [K, DesignToken[]][] => {
	const by = new Map<K, DesignToken[]>();
	for (const t of tokens) {
		const list = by.get(key(t));
		if (list) list.push(t);
		else by.set(key(t), [t]);
	}
	return [...by];
};

const setKey = (t: DesignToken) => `${t.group}/${t.set}`;

/** What a token is, in words, for the search to look through: what it points at too. */
const searchable = (t: DesignToken) => [t.path, t.group, t.set, t.name, t.value, t.ref?.path ?? ''].join(' ').toLowerCase();

/**
 * A token's row: its swatch, name, what it points at, the contrast of its pair when it is the one read under the other,
 * and its value, as changed. Pressing it opens its control, beside the panel, over the components it changes.
 */
const TokenRow = ({ token }: { token: DesignToken }) => {
	const changes = useTokenChanges();
	const target = changes.target(token);
	const partner = isForeground(token) ? undefined : contrastPartner(token, changes.shown);
	const ratio = partner ? contrastRatio(token.value, partner.value) : null;
	const edited = changes.isChanged(token);
	return (
		<li data-token={token.path} data-changed={edited || undefined} title={`${token.source.file}:${token.source.line}`}>
			<Popover>
				<PopoverTrigger asChild>
					<button
						type="button"
						aria-label={`Change ${labelOf(token)}`}
						className="hover:bg-muted/50 data-[state=open]:bg-muted -mx-2 flex w-[calc(100%+1rem)] items-center gap-2 rounded-md px-2 py-1 text-left text-sm"
					>
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
					</button>
				</PopoverTrigger>
				<PopoverContent side="left" align="start" className="w-72">
					<TokenEditor token={token} />
				</PopoverContent>
			</Popover>
		</li>
	);
};

/** The sets of a group (or of a tab with one): each its name as a heading over its tokens, all listed. */
const Sets = ({ tokens }: { tokens: DesignToken[] }) => (
	<div className="flex flex-col gap-4">
		{inOrder(tokens, setKey).map(([key, inSet]) => (
			<section key={key} data-token-set aria-label={(inSet[0] as DesignToken).set} className="flex flex-col gap-1">
				<h4 data-set-name className="text-sm font-medium">
					{(inSet[0] as DesignToken).set}
				</h4>
				<ul className="flex flex-col">
					{inSet.map((t) => (
						<TokenRow key={t.path} token={t} />
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
const TokensTab = ({ category, tokens, query, onQuery }: { category: string; tokens: DesignToken[]; query: string; onQuery: (query: string) => void }) => {
	// Every group is open until the person closes it, so a group the library gains, or a search finds, is open too.
	const [closed, setClosed] = useState<string[]>([]);
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
				<Accordion type="multiple" value={names.filter((g) => !closed.includes(g))} onValueChange={(open) => setClosed(names.filter((g) => !open.includes(g)))}>
					{groups.map(([group, inGroup]) => (
						<AccordionItem key={group} value={group} data-token-group className={STICKY_HEADER}>
							<AccordionTrigger>
								<span className="flex items-baseline gap-2">
									<span data-name>{group}</span>
									<span data-count className="text-muted-foreground font-normal">
										{inGroup.length}
									</span>
								</span>
							</AccordionTrigger>
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
	edits,
	onEdits,
	live,
}: {
	tokens: DesignTokens;
	/** The change being tried, and what changes it. */
	edits: TokenEdit[];
	onEdits: (edits: TokenEdit[]) => void;
	/** Whether a component is open, so a change is seen as it is made. */
	live: boolean;
}) => {
	const [current, setCurrent] = useState<string | null>(null);
	const [queries, setQueries] = useState<Record<string, string>>({});
	const changes = useTokenChangesFor(tokens.tokens, edits, onEdits);
	const categories = useMemo(() => inOrder(changes.shown, (t) => t.category), [changes.shown]);

	if (tokens.source === null || categories.length === 0) {
		return (
			<>
				<TokenProblems problems={tokens.problems} />
				<div className="p-4">
					<p className="text-muted-foreground text-sm">No tokens were found in this library. Looked for {tokens.looked.join(', ')}.</p>
				</div>
			</>
		);
	}

	// A category the library no longer has is not kept: the first is shown.
	const active = categories.some(([c]) => c === current) ? (current as string) : (categories[0] as [string, DesignToken[]])[0];
	return (
		<TokenChangesProvider value={changes}>
			<TokenProblems problems={tokens.problems} />
			<ChangedTokens live={live} />
			<PanelTabs value={active} onValueChange={setCurrent}>
				<PanelTabsList>
					{categories.map(([category]) => (
						<PanelTabsTrigger key={category} value={category}>
							{category}
						</PanelTabsTrigger>
					))}
				</PanelTabsList>
				{categories.map(([category, inCategory]) => (
					<PanelTabsContent key={category} value={category} className="pt-0">
						<TokensTab
							category={category}
							tokens={inCategory}
							query={queries[category] ?? ''}
							onQuery={(query) => setQueries((all) => ({ ...all, [category]: query }))}
						/>
					</PanelTabsContent>
				))}
			</PanelTabs>
		</TokenChangesProvider>
	);
};
