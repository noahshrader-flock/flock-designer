import { TriangleAlertIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { DesignToken, DesignTokens } from '../shared/contract';
import { plural } from '../shared/plural';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './ui/accordion';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { SearchField } from './SearchField';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';

/**
 * The library's tokens, in the panel at the right of the Design System tab (T2 of the design system plan), read only:
 * the list T1 reads, in line tabs by category (Colour, Spacing, Shape: the reader says which each token is on, so a
 * category the library gains is a tab with nothing else changed), each tab with its own search. Within a tab the tokens
 * are in groups (the tones, each mode's palette) and sets, closed until opened, so 600 tokens are a short list; a tab
 * with one group shows its sets directly. A set shows a strip of its colours and the file it is written in; open, each
 * token shows its value, and a palette role the tone it points at. What the library has that is not read is said above
 * the tabs. T3 adds the controls to these rows.
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

/** An opacity written after a tone (`66`), as a person reads it (`40%`). */
const opacity = (alpha: string) => `${Math.round((parseInt(alpha, 16) / 255) * 100)}%`;

/** What a token is, in words, for the search to look through. */
const searchable = (t: DesignToken) => [t.path, t.group, t.set, t.name, t.value, t.ref?.tone ?? ''].join(' ').toLowerCase();

/** A colour, as a small square. Its colour is the token's own, a runtime value, so it is inline. */
const Swatch = ({ value, size = 'size-4' }: { value: string; size?: string }) => (
	<span data-swatch className={`${size} shrink-0 rounded-sm border`} style={{ backgroundColor: value }} />
);

const TokenRow = ({ token }: { token: DesignToken }) => (
	<li data-token={token.path} title={`${token.source.file}:${token.source.line}`} className="flex items-center gap-2 py-1 text-sm">
		{token.kind === 'colour' && <Swatch value={token.value} />}
		<span className="min-w-0 truncate">{token.name}</span>
		{token.ref && (
			<span className="text-muted-foreground truncate text-xs">
				{token.ref.tone} {token.ref.step}
				{token.ref.alpha && ` at ${opacity(token.ref.alpha)}`}
			</span>
		)}
		<span className="text-muted-foreground ml-auto shrink-0 font-mono text-xs">{token.value}</span>
	</li>
);

/** The sets of one group (or of a tab with one), each closed until opened. */
const Sets = ({ tokens, open, onOpen }: { tokens: DesignToken[]; open: string[]; onOpen: (open: string[]) => void }) => (
	<Accordion type="multiple" value={open} onValueChange={onOpen}>
		{inOrder(tokens, setKey).map(([key, inSet]) => {
			const first = inSet[0] as DesignToken;
			return (
				<AccordionItem key={key} value={key} data-token-set>
					<AccordionTrigger className="py-2 font-normal">
						<span className="flex min-w-0 flex-col gap-1">
							<span data-name className="text-sm">
								{first.set}
							</span>
							{first.kind === 'colour' ? (
								<span className="flex flex-wrap gap-0.5">
									{inSet.map((t) => (
										<Swatch key={t.path} value={t.value} size="size-3" />
									))}
								</span>
							) : (
								<span className="text-muted-foreground font-mono text-xs">{first.value}</span>
							)}
							<span className="text-muted-foreground truncate font-mono text-xs">{first.source.file}</span>
						</span>
					</AccordionTrigger>
					<AccordionContent>
						<ul className="flex flex-col">
							{inSet.map((t) => (
								<TokenRow key={t.path} token={t} />
							))}
						</ul>
					</AccordionContent>
				</AccordionItem>
			);
		})}
	</Accordion>
);

/** One category's tab: its own search, then its tokens. What is typed is the panel's, so it is there when the tab is back. */
const TokensTab = ({ category, tokens, query, onQuery }: { category: string; tokens: DesignToken[]; query: string; onQuery: (query: string) => void }) => {
	const [groupsOpen, setGroupsOpen] = useState<string[]>([]);
	const [setsOpen, setSetsOpen] = useState<string[]>([]);
	const q = query.trim().toLowerCase();
	const shown = useMemo(() => (q === '' ? tokens : tokens.filter((t) => searchable(t).includes(q))), [tokens, q]);
	// A search opens everything it found; closing a group afterwards is the person's.
	useEffect(() => {
		if (q === '') return;
		setGroupsOpen([...new Set(shown.map((t) => t.group))]);
		setSetsOpen([...new Set(shown.map(setKey))]);
	}, [q, shown]);

	const groups = inOrder(shown, (t) => t.group);
	return (
		<div className="flex flex-col gap-3">
			<SearchField label={`Search ${category.toLowerCase()}`} value={query} onChange={onQuery} />
			{shown.length === 0 ? (
				<p className="text-muted-foreground text-sm">No token matches.</p>
			) : groups.length === 1 ? (
				// One group would say the tab's own name again, so its sets are shown directly.
				<Sets tokens={shown} open={setsOpen} onOpen={setSetsOpen} />
			) : (
				<Accordion type="multiple" value={groupsOpen} onValueChange={setGroupsOpen}>
					{groups.map(([group, inGroup]) => (
						<AccordionItem key={group} value={group} data-token-group>
							<AccordionTrigger>
								<span className="flex items-baseline gap-2">
									<span data-name>{group}</span>
									<span data-count className="text-muted-foreground font-normal">
										{inGroup.length}
									</span>
								</span>
							</AccordionTrigger>
							<AccordionContent className="pl-2">
								<Sets tokens={inGroup} open={setsOpen} onOpen={setSetsOpen} />
							</AccordionContent>
						</AccordionItem>
					))}
				</Accordion>
			)}
		</div>
	);
};

export const TokensPanel = ({ tokens }: { tokens: DesignTokens }) => {
	const [current, setCurrent] = useState<string | null>(null);
	const [queries, setQueries] = useState<Record<string, string>>({});
	const categories = useMemo(() => inOrder(tokens.tokens, (t) => t.category), [tokens.tokens]);

	if (tokens.source === null || categories.length === 0) {
		return (
			<div className="p-4">
				<p className="text-muted-foreground text-sm">No tokens were found in this library. Looked for {tokens.looked.join(', ')}.</p>
			</div>
		);
	}

	// A category the library no longer has is not kept: the first is shown.
	const active = categories.some(([c]) => c === current) ? (current as string) : (categories[0] as [string, DesignToken[]])[0];
	return (
		<div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
			{tokens.problems.length > 0 && (
				<Alert variant="warning">
					<TriangleAlertIcon />
					<AlertTitle>{plural(tokens.problems.length, 'value')} in the library could not be read</AlertTitle>
					<AlertDescription>
						<ul className="flex flex-col gap-1">
							{tokens.problems.map((p) => (
								<li key={`${p.file}:${p.line ?? ''}:${p.reason}`}>
									<span className="font-mono">
										{p.file}
										{p.line !== undefined && `:${p.line}`}
									</span>{' '}
									{p.reason}
								</li>
							))}
						</ul>
					</AlertDescription>
				</Alert>
			)}
			<Tabs value={active} onValueChange={setCurrent}>
				<TabsList variant="line" className="w-full">
					{categories.map(([category]) => (
						<TabsTrigger key={category} value={category}>
							{category}
						</TabsTrigger>
					))}
				</TabsList>
				{categories.map(([category, inCategory]) => (
					<TabsContent key={category} value={category}>
						<TokensTab category={category} tokens={inCategory} query={queries[category] ?? ''} onQuery={(query) => setQueries((all) => ({ ...all, [category]: query }))} />
					</TabsContent>
				))}
			</Tabs>
		</div>
	);
};
