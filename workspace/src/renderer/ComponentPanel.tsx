import type { CatalogComponent, ComponentTokens, DesignToken } from '../shared/contract';
import { countsOf, summaryOf } from '../shared/accessibility';
import { plural } from '../shared/plural';
import { AccessibilityFindings } from './AccessibilityStatus';
import { LinesSkeleton, SkeletonStatus } from './Skeletons';
import { useTokenChanges } from './tokenChanges';
import { MOST_LISTED, sharedWith, useComponentTokens } from './useComponentTokens';
import { Swatch } from './Swatch';
import { inOrder } from '../shared/primitives';
import { Sets } from './TokensPanel';
import { Notice, RetryButton } from './Notice';
import { cn } from '@/lib/utils';

/**
 * The side panel's view of the open component (T6 of the design system plan, decision 29): **Made from**, the library's
 * tokens it draws with, as the same rows the tokens panel has, so a change is made to a token and seen in every component
 * that draws with it; under each, how often it is drawn and **which other components share it**, before anything is
 * changed. Then **Not tokens**: what the component sets itself, for the Design System owner, and how much is a shade
 * worked out from a token. Found by drawing every story with the tokens tagged, the first time for each commit.
 */
export const ComponentPanel = ({ component, components }: { component: CatalogComponent; components: CatalogComponent[] }) => {
	const { answer, retry } = useComponentTokens(component.id);

	return (
		<div data-panel="component" className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
			<div className="flex flex-col gap-0.5">
				<h2 className="text-base font-semibold">{component.name}</h2>
				<p className="text-muted-foreground text-sm">{component.subtitle ?? component.group}</p>
			</div>
			{answer === null || answer.state === 'building' ? (
				<div className="flex flex-col gap-3">
					<SkeletonStatus label={`Finding the tokens ${component.name} draws with…`}>
						<LinesSkeleton count={5} />
					</SkeletonStatus>
					<p className="text-muted-foreground text-xs">
						The first time for each version of the library, every story is drawn with each token marked, which takes a few seconds.
					</p>
				</div>
			) : answer.state === 'failed' ? (
				<Notice variant="destructive" action={<RetryButton size="xs" onClick={retry} />}>
					{answer.error}
				</Notice>
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
		return (
			<span data-token-use title={also.join('\n')}>
				{plural(used.get(t.path) ?? 0, 'use')} · {sharedWith(also)}
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
					{answer.notTokens.length > MOST_LISTED && (
						<p className="text-muted-foreground text-xs">And {answer.notTokens.length - MOST_LISTED} more.</p>
					)}
					{answer.derived > 0 && (
						<p className="text-muted-foreground text-xs">
							{plural(answer.derived, 'use')} {answer.derived === 1 ? 'is a shade' : 'are shades'} worked out from a token, such as a hover’s darker
							color.
						</p>
					)}
				</section>
			)}
			{/* What axe found in its stories, at the design system's target (T7). */}
			<section aria-label="Accessibility" className="flex flex-col gap-2">
				<h3 className="text-sm font-semibold">Accessibility</h3>
				{answer.accessibility === null ? (
					<p className="text-muted-foreground text-xs">Not checked: its stories did not finish drawing for the check.</p>
				) : (
					<>
						<p data-accessibility-summary className={cn('text-sm', answer.accessibility.violations.length && 'text-warning')}>
							{summaryOf(countsOf(answer.accessibility))}
						</p>
						<AccessibilityFindings result={answer.accessibility} />
					</>
				)}
			</section>
		</>
	);
};
