import { useEffect, useState } from 'react';
import type { CatalogComponent, ComponentTokens, DesignToken } from '../shared/contract';
import { plural } from '../shared/plural';
import { Loading } from './Loading';
import { useTokenChanges } from './tokenChanges';
import { Swatch } from './TokenEditor';
import { Sets, inOrder } from './TokensPanel';
import { Alert, AlertAction, AlertDescription } from './ui/alert';
import { Button } from './ui/button';

/** How often the panel asks again while every story is being drawn. */
const ASK_EVERY_MS = 3000;
/** How many of the values a component sets itself are listed before the rest are counted. */
const MOST_LISTED = 8;
/** How many of the other components that share a token are named on its row. */
const MOST_NAMED = 3;

/**
 * The side panel's view of the open component (T6 of the design system plan, decision 29): **Made from**, the library's
 * tokens it draws with, as the same rows the tokens panel has, so a change is made to a token and seen in every component
 * that draws with it; under each, how often it is drawn and **which other components share it**, before anything is
 * changed. Then **Not tokens**: what the component sets itself, for the Design System owner, and how much is a shade
 * worked out from a token. Found by drawing every story with the tokens tagged, the first time for each commit.
 */
export const ComponentPanel = ({ component, components }: { component: CatalogComponent; components: CatalogComponent[] }) => {
	const [answer, setAnswer] = useState<ComponentTokens | null>(null);
	const [asks, setAsks] = useState(0);
	useEffect(() => {
		let live = true;
		let timer: ReturnType<typeof setTimeout> | undefined;
		const ask = async () => {
			const r = await window.workspace.componentTokens(component.id);
			if (!live) return;
			const next: ComponentTokens = r.ok ? r.value : { state: 'failed', error: r.error };
			setAnswer(next);
			if (next.state === 'building') timer = setTimeout(() => void ask(), ASK_EVERY_MS);
		};
		void ask();
		return () => {
			live = false;
			clearTimeout(timer);
		};
	}, [component.id, asks]);

	return (
		<div data-panel="component" className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
			<div className="flex flex-col gap-0.5">
				<h3 className="text-sm font-semibold">{component.name}</h3>
				<p className="text-muted-foreground text-sm">{component.subtitle ?? component.group}</p>
			</div>
			{answer === null || answer.state === 'building' ? (
				<div className="flex flex-col gap-2">
					<Loading>Finding the tokens {component.name} draws with…</Loading>
					<p className="text-muted-foreground text-xs">
						The first time for each version of the library, every story is drawn with each token marked, which takes a few seconds.
					</p>
				</div>
			) : answer.state === 'failed' ? (
				<Alert variant="destructive">
					<AlertDescription>{answer.error}</AlertDescription>
					<AlertAction>
						<Button variant="outline" size="xs" onClick={() => setAsks((n) => n + 1)}>
							Try again
						</Button>
					</AlertAction>
				</Alert>
			) : (
				<Uses component={component} components={components} answer={answer} />
			)}
		</div>
	);
};

/** Made from and Not tokens, once every story has been drawn. */
const Uses = ({
	component,
	components,
	answer,
}: {
	component: CatalogComponent;
	components: CatalogComponent[];
	answer: Extract<ComponentTokens, { state: 'ready' }>;
}) => {
	const { byPath } = useTokenChanges();
	const names = new Map(components.map((c) => [c.id, c.name]));
	const used = new Map(answer.uses.map((u) => [u.path, u.uses]));
	// As changed, so a change being tried shows here as in the tokens view; the most drawn first.
	const tokens = answer.uses.flatMap((u) => (byPath.has(u.path) ? [byPath.get(u.path) as DesignToken] : []));
	const others = (t: DesignToken) => (answer.sharedWith[t.path] ?? []).map((f) => names.get(f) ?? f);
	const note = (t: DesignToken) => {
		const also = others(t);
		const shared =
			also.length === 0
				? 'no other component'
				: `also ${also.slice(0, MOST_NAMED).join(', ')}${also.length > MOST_NAMED ? ` and ${also.length - MOST_NAMED} more` : ''}`;
		return (
			<span data-token-use title={also.join('\n')}>
				{plural(used.get(t.path) ?? 0, 'use')} · {shared}
			</span>
		);
	};

	return (
		<>
			<section aria-label="Made from" className="flex flex-col gap-3">
				<h3 className="text-sm font-semibold">Made from</h3>
				{tokens.length === 0 ? (
					<p className="text-muted-foreground text-sm">{component.name} draws with none of the library’s tokens.</p>
				) : (
					inOrder(tokens, (t) => t.category).map(([category, inCategory]) => {
						const groups = inOrder(inCategory, (t) => t.group);
						return (
							<div key={category} data-made-from={category} className="flex flex-col gap-2">
								<h4 className="text-muted-foreground text-xs font-medium">{category}</h4>
								{/* One group would say the category again, so its sets are shown directly, as on a tokens tab. */}
								{groups.length === 1 ? (
									<Sets tokens={inCategory} noteFor={note} />
								) : (
									groups.map(([group, inGroup]) => (
										<div key={group} className="flex flex-col gap-1">
											<p className="text-sm font-semibold">{group}</p>
											<Sets tokens={inGroup} noteFor={note} />
										</div>
									))
								)}
							</div>
						);
					})
				)}
			</section>
			{(answer.notTokens.length > 0 || answer.derived > 0) && (
				<section aria-label="Not tokens" className="flex flex-col gap-2">
					<h3 className="text-sm font-semibold">Not tokens</h3>
					<p className="text-muted-foreground text-xs">Set in the component itself, so they are changed in the library, not here.</p>
					<ul className="flex flex-col">
						{answer.notTokens.slice(0, MOST_LISTED).map((n) => (
							<li key={`${n.kind} ${n.value}`} data-not-token className="flex items-center gap-2 py-1 text-sm">
								{n.kind === 'color' && <Swatch value={n.value} />}
								<span className="capitalize">{n.kind}</span>
								<span className="text-muted-foreground font-mono text-xs">{n.value}</span>
								<span className="text-muted-foreground ml-auto shrink-0 text-xs">{plural(n.uses, 'use')}</span>
							</li>
						))}
					</ul>
					{answer.notTokens.length > MOST_LISTED && <p className="text-muted-foreground text-xs">And {answer.notTokens.length - MOST_LISTED} more.</p>}
					{answer.derived > 0 && (
						<p className="text-muted-foreground text-xs">
							{plural(answer.derived, 'use')} {answer.derived === 1 ? 'is a shade' : 'are shades'} worked out from a token, such as a hover’s darker color.
						</p>
					)}
				</section>
			)}
		</>
	);
};
