import { TriangleAlertIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { DesignToken, DesignTokens } from '../shared/contract';
import { plural } from '../shared/plural';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './ui/accordion';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { Input } from './ui/input';

/**
 * The library's tokens, in the panel at the right of a component's page (T2 of the design system plan), read only: the
 * list T1 reads, grouped as the library groups them (the tones, each mode's palette, spacing, radius), each group and
 * each of its sets closed until opened, so 600 tokens are a short list. A set shows a strip of its colours and the file
 * it is written in; open, each token shows its value, and a palette role the tone it points at. Search shows only what
 * matches, opened to it. What the library has that is not read is said at the top. T3 adds the controls to these rows.
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

export const TokensPanel = ({ tokens }: { tokens: DesignTokens }) => {
	const [query, setQuery] = useState('');
	const [groupsOpen, setGroupsOpen] = useState<string[]>([]);
	const [setsOpen, setSetsOpen] = useState<string[]>([]);

	const q = query.trim().toLowerCase();
	const shown = useMemo(() => (q === '' ? tokens.tokens : tokens.tokens.filter((t) => searchable(t).includes(q))), [tokens.tokens, q]);
	// A search opens everything it found; closing a group afterwards is the person's.
	useEffect(() => {
		if (q === '') return;
		setGroupsOpen([...new Set(shown.map((t) => t.group))]);
		setSetsOpen([...new Set(shown.map(setKey))]);
	}, [q, shown]);

	if (tokens.source === null) {
		return (
			<div className="flex flex-col gap-2 p-4">
				<h3 className="text-sm font-semibold">Tokens</h3>
				<p className="text-muted-foreground text-sm">
					No tokens were found in this library. Looked in {tokens.looked.join(', ')}.
				</p>
			</div>
		);
	}

	return (
		<div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
			<div className="flex items-baseline gap-2">
				<h3 className="text-sm font-semibold">Tokens</h3>
				<span className="text-muted-foreground text-sm">{plural(tokens.tokens.length, 'token')}</span>
			</div>
			<Input type="search" aria-label="Search tokens" placeholder="Search tokens" value={query} onChange={(e) => setQuery(e.target.value)} />
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
			{shown.length === 0 ? (
				<p className="text-muted-foreground text-sm">No token matches.</p>
			) : (
				<Accordion type="multiple" value={groupsOpen} onValueChange={setGroupsOpen}>
					{inOrder(shown, (t) => t.group).map(([group, inGroup]) => (
						<AccordionItem key={group} value={group} data-token-group>
							<AccordionTrigger>
								<span className="flex items-baseline gap-2">
									<span data-name>{group}</span>
									<span data-count className="text-muted-foreground font-normal">
										{inGroup.length}
									</span>
								</span>
							</AccordionTrigger>
							<AccordionContent>
								<Accordion type="multiple" value={setsOpen} onValueChange={setSetsOpen} className="pl-2">
									{inOrder(inGroup, setKey).map(([key, inSet]) => {
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
							</AccordionContent>
						</AccordionItem>
					))}
				</Accordion>
			)}
		</div>
	);
};
