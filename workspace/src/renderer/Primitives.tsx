import { type ReactNode, useRef } from 'react';
import type { Catalog, DesignToken, TokenEdit } from '../shared/contract';
import { plural } from '../shared/plural';
import { PRIMITIVES, type Primitive, byPrimitive, inOrder } from '../shared/primitives';
import { nameOf, pixelsOf, readsAs, withEdits } from '../shared/tokens';
import { Page } from './Page';
import { LinesSkeleton, SkeletonStatus } from './Skeletons';
import { Swatch } from './TokenEditor';
import { TokenProblems } from './TokenProblems';
import { badgeVariants } from './ui/badge';

/** What every drawing is given: the tokens it draws, and every token by its path, to say what one points at. */
interface Drawing {
	tokens: DesignToken[];
	byPath: Map<string, DesignToken>;
}

/** A token's name and what it reads as, under its drawing: the tone it points at, or its value. */
const Caption = ({ token, byPath }: { token: DesignToken; byPath: Map<string, DesignToken> }) => (
	<span className="flex flex-col">
		<span data-swatch-label className="text-xs font-medium">
			{token.name}
		</span>
		<span className="text-muted-foreground font-mono text-xs">{readsAs(token, byPath)}</span>
	</span>
);

/** Colors: each set in a row of swatches, a tone family's steps or a role's variants. */
const Swatches = ({ tokens, byPath }: Drawing) => (
	<div className="flex flex-col gap-3">
		{inOrder(tokens, (t) => `${t.group}/${t.set}`).map(([key, inSet]) => (
			<div key={key} data-primitive-set={key} className="flex flex-col gap-1.5">
				<span className="text-sm">{(inSet[0] as DesignToken).set}</span>
				<div className="flex flex-wrap gap-3">
					{inSet.map((t) => (
						<div key={t.path} data-primitive-token className="flex w-28 flex-col gap-1">
							<Swatch value={t.value} size="h-10 w-full" />
							<Caption token={t} byPath={byPath} />
						</div>
					))}
				</div>
			</div>
		))}
	</div>
);

/** Spacing: each step a bar as long as it is. */
const Bars = ({ tokens }: Drawing) => (
	<ul className="flex flex-col gap-2">
		{tokens.map((t) => {
			const px = pixelsOf(t.value);
			return (
				<li key={t.path} data-primitive-token className="flex items-center gap-3 text-sm">
					<span className="w-32 shrink-0 truncate">{nameOf(t)}</span>
					{px !== null && <span data-spacing-bar className="bg-primary/40 h-3 rounded-sm" style={{ width: `${px}px` }} />}
					<span className="text-muted-foreground font-mono text-xs">{t.value}</span>
				</li>
			);
		})}
	</ul>
);

/** A radius: a corner of its size, on a box. */
const Corners = ({ tokens }: Drawing) => (
	<div className="flex flex-wrap gap-4">
		{tokens.map((t) => {
			const px = pixelsOf(t.value);
			return (
				<div key={t.path} data-primitive-token className="flex flex-col gap-1.5">
					<span data-radius-sample className="bg-muted size-16 border" style={px === null ? undefined : { borderRadius: `${px}px` }} />
					<span className="text-sm">{nameOf(t)}</span>
					<span className="text-muted-foreground font-mono text-xs">{t.value}</span>
				</div>
			);
		})}
	</div>
);

/** Anything with no drawing of its own: its names and values. */
const Table = ({ tokens }: Drawing) => (
	<table className="w-full max-w-xl text-sm">
		<thead className="sr-only">
			<tr>
				<th>Name</th>
				<th>Value</th>
			</tr>
		</thead>
		<tbody className="divide-y">
			{tokens.map((t) => (
				<tr key={t.path}>
					<td className="py-1.5">{nameOf(t)}</td>
					<td className="text-muted-foreground py-1.5 text-right font-mono text-xs">{t.value}</td>
				</tr>
			))}
		</tbody>
	</table>
);

/** Each of the vocabulary's drawings, by the word it uses for it: a new drawing is one entry. */
const DRAWINGS: Record<Primitive['drawn'], (props: Drawing) => ReactNode> = { swatches: Swatches, bars: Bars, corners: Corners };

/** A primitive's tokens as the vocabulary says to draw them, a group heading over each when it has several. */
const Drawn = ({ primitive, tokens, byPath }: { primitive: Primitive | undefined; tokens: DesignToken[]; byPath: Map<string, DesignToken> }) => {
	const Draw = primitive ? DRAWINGS[primitive.drawn] : Table;
	const draw = (list: DesignToken[]): ReactNode => <Draw tokens={list} byPath={byPath} />;
	const groups = inOrder(tokens, (t) => t.group);
	// One group would say the primitive's own name again, so its tokens are drawn directly, as on a tokens tab.
	if (groups.length === 1) return draw(tokens);
	return (
		<div className="flex flex-col gap-6">
			{groups.map(([group, inGroup]) => (
				<div key={group} className="flex flex-col gap-3">
					<h3 className="text-muted-foreground text-sm font-medium">{group}</h3>
					{draw(inGroup)}
				</div>
			))}
		</div>
	);
};

/** "theme files, CSS variables and design token files". */
const listed = (words: string[]): string => (words.length < 2 ? (words[0] ?? '') : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`);

/** A chip in the line at the top: a way to a primitive's section, or to the list of what is not defined. */
const Chip = ({ defined, onPress, children }: { defined: boolean; onPress: () => void; children: ReactNode }) => (
	<button
		type="button"
		data-primitive-chip
		data-defined={defined}
		className={`${badgeVariants({ variant: defined ? 'secondary' : 'outline' })} cursor-pointer ${defined ? '' : 'text-muted-foreground'}`}
		onClick={onPress}
	>
		{children}
	</button>
);

/**
 * The Primitives tab of the Design System tab (R2 of the design system plan): the design system seen whole, from the same
 * list the side panel shows (`byPrimitive`, the vocabulary's order), as the change being tried there leaves it. At its top a
 * chip for each primitive, how many tokens it has or that it is not defined, each one a way to its section; then each
 * primitive drawn as the vocabulary says (the palette as swatches, spacing as bars, a radius as a corner), anything without a
 * drawing as a plain table, and last the primitives it does not define, with where DSNR looked. **A picture, not a panel:**
 * nothing on it changes a token, which is the Components tab's side panel's, beside the components it changes.
 */
export const Primitives = ({ catalog, edits }: { catalog: Catalog | null; edits: TokenEdit[] }) => {
	const sections = useRef(new Map<string, HTMLElement | null>());
	if (catalog === null)
		return (
			<SkeletonStatus label="Reading the design system…">
				<Page>
					<LinesSkeleton count={3} />
				</Page>
			</SkeletonStatus>
		);
	if (catalog.state !== 'ready')
		return (
			<Page>
				<p className="text-muted-foreground text-sm">
					{catalog.state === 'none' ? 'Connect a design system on the Components tab to see its primitives.' : 'The design system could not be read: the Components tab says why.'}
				</p>
			</Page>
		);

	const { tokens: read } = catalog;
	const tokens = withEdits(read.tokens, edits);
	const byPath = new Map(tokens.map((t) => [t.path, t]));
	const found = byPrimitive(tokens);
	const missing = PRIMITIVES.filter((p) => !found.some(([category]) => category === p.category));
	const go = (key: string) => sections.current.get(key)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	const count = (category: string) => found.find(([c]) => c === category)?.[1].length;
	return (
		<Page>
			<div data-coverage className="flex flex-wrap items-center gap-2">
				{PRIMITIVES.map((p) => {
					const n = count(p.category);
					return (
						<Chip key={p.category} defined={n !== undefined} onPress={() => go(n === undefined ? 'not-defined' : p.category)}>
							{n === undefined ? `${p.category} not defined` : `${p.category} ${n}`}
						</Chip>
					);
				})}
				{found
					.filter(([category]) => !PRIMITIVES.some((p) => p.category === category))
					.map(([category, list]) => (
						<Chip key={category} defined onPress={() => go(category)}>
							{category} {list.length}
						</Chip>
					))}
			</div>
			{edits.length > 0 && <p className="text-muted-foreground text-sm">Showing the change being tried on the Components tab ({plural(edits.length, 'token')}).</p>}
			{/* In the page's own column: the panel's padding is the panel's. */}
			<TokenProblems problems={read.problems} className="" />
			{found.map(([category, list]) => (
				<section
					key={category}
					ref={(el) => void sections.current.set(category, el)}
					data-primitive={category}
					aria-label={category}
					className="flex scroll-mt-4 flex-col gap-4 border-t pt-6"
				>
					<h2 className="text-base font-semibold">{category}</h2>
					<Drawn primitive={PRIMITIVES.find((p) => p.category === category)} tokens={list} byPath={byPath} />
				</section>
			))}
			{missing.length > 0 && (
				<section ref={(el) => void sections.current.set('not-defined', el)} data-not-defined aria-label="Not defined" className="flex scroll-mt-4 flex-col gap-3 border-t pt-6">
					<h2 className="text-base font-semibold">Not defined</h2>
					{read.source === null && <p className="text-muted-foreground text-sm">No tokens were found. Looked for {listed(read.looked)}.</p>}
					<ul className="flex flex-col gap-1.5">
						{missing.map((p) => (
							<li key={p.category} className="text-sm">
								<span className="font-medium">{p.category}</span>
								{read.source !== null && <span className="text-muted-foreground"> Not defined in its {read.source}.</span>}
							</li>
						))}
					</ul>
				</section>
			)}
		</Page>
	);
};
