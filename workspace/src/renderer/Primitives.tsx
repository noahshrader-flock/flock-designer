import { type ReactNode, useEffect, useRef, useState } from 'react';
import { specimenAddress } from '../shared/catalog';
import type { Catalog, DesignToken, StoryPreview, TokenEdit } from '../shared/contract';
import { plural } from '../shared/plural';
import { PRIMITIVES, type Primitive, byPrimitive, inOrder, missingParts } from '../shared/primitives';
import { typeSpecimens } from '../shared/specimens';
import { nameOf, pixelsOf, readsAs, withEdits } from '../shared/tokens';
import { Page } from './Page';
import { LinesSkeleton, SkeletonStatus } from './Skeletons';
import { StoryFrame } from './StoryFrame';
import { Swatch } from './TokenEditor';
import { TokenProblems } from './TokenProblems';
import { badgeVariants } from './ui/badge';
import { Card, CardContent } from './ui/card';
import { Skeleton } from './ui/skeleton';

/** The design system's preview build, which a drawing that needs its own CSS (a type specimen) is drawn in; asked for once. */
type Preview = StoryPreview | { state: 'asking' };

/**
 * What every drawing is given: the tokens it draws, every token by its path (to say what one points at), and the design
 * system's preview build, for a drawing made in it.
 */
interface Drawing {
	tokens: DesignToken[];
	byPath: Map<string, DesignToken>;
	preview: Preview;
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

/** Elevation: each shadow on a box it raises, with its name and what it is. */
const Shadows = ({ tokens }: Drawing) => (
	<div className="flex flex-wrap gap-6">
		{tokens.map((t) => (
			<div key={t.path} data-primitive-token className="flex w-40 flex-col gap-2">
				<span data-shadow-sample className="bg-card h-20 rounded-lg" style={{ boxShadow: t.value }} />
				<span className="text-sm">{nameOf(t)}</span>
				<span className="text-muted-foreground font-mono text-xs break-words">{t.value}</span>
			</div>
		))}
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

/** Why a specimen cannot be drawn, from what the preview build said. */
const notBuilt = (preview: StoryPreview): string =>
	preview.state === 'no-packages'
		? `: its packages are not installed (run npm install in ${preview.root})`
		: preview.state === 'failed'
			? `: ${preview.error}`
			: '';

/**
 * Typography: a specimen of each family and style, drawn in the design system's own preview so its fonts are its own (the
 * page says when one is not there), and under it the values as written, to read off.
 */
const Specimens = ({ tokens, byPath, preview }: Drawing) => (
	<div className="flex flex-col gap-4">
		{preview.state === 'ready' ? (
			// In a card, as a component's stories are: the page inside it keeps its own padding.
			<Card className="gap-0 overflow-hidden py-0">
				<CardContent className="px-0">
					<StoryFrame src={specimenAddress(preview.base, typeSpecimens(tokens))} title="Type specimen" />
				</CardContent>
			</Card>
		) : preview.state === 'asking' ? (
			<Skeleton className="h-32 w-full" />
		) : (
			<p className="text-muted-foreground text-sm">The specimen is drawn in the design system’s preview, which cannot be built here{notBuilt(preview)}.</p>
		)}
		<Table tokens={tokens} byPath={byPath} preview={preview} />
	</div>
);

/** Each of the vocabulary's drawings, by the word it uses for it: a new drawing is one entry. */
const DRAWINGS: Record<Primitive['drawn'], (props: Drawing) => ReactNode> = { swatches: Swatches, bars: Bars, corners: Corners, specimens: Specimens, shadows: Shadows, table: Table };

/**
 * A primitive's tokens as the vocabulary says to draw them, a group heading over each when it has several. A primitive made
 * of parts (typography) is one drawing of the whole: its parts are what its groups are.
 */
const Drawn = ({ primitive, tokens, byPath, preview }: { primitive: Primitive | undefined } & Drawing) => {
	const Draw = primitive ? DRAWINGS[primitive.drawn] : Table;
	const draw = (list: DesignToken[]): ReactNode => <Draw tokens={list} byPath={byPath} preview={preview} />;
	const groups = inOrder(tokens, (t) => t.group);
	// One group would say the primitive's own name again, so its tokens are drawn directly, as on a tokens tab.
	if (primitive?.parts !== undefined || groups.length === 1) return draw(tokens);
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

/** Whether the design system has a primitive the preview build draws: only then is it asked for. */
const drawnInPreview = (tokens: DesignToken[]): boolean => tokens.some((t) => PRIMITIVES.find((p) => p.category === t.category)?.drawn === 'specimens');

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
 * drawing as a plain table, and last the primitives it does not define, with where DSNR looked, and the parts it leaves out of
 * one it does (R3: Flock's typography is a family, with no size, weight or line height). Typography is a specimen drawn in
 * the design system's preview build, which is asked for once a commit, and only while the tab is shown. **A picture, not a
 * panel:** nothing on it changes a token, which is the Components tab's side panel's, beside the components it changes.
 */
export const Primitives = ({ catalog, edits, hidden }: { catalog: Catalog | null; edits: TokenEdit[]; hidden: boolean }) => {
	const sections = useRef(new Map<string, HTMLElement | null>());
	const [preview, setPreview] = useState<Preview>({ state: 'asking' });
	const commit = catalog?.state === 'ready' && drawnInPreview(catalog.tokens.tokens) ? catalog.commit : null;
	const askedFor = useRef<string | null>(null);
	useEffect(() => {
		if (hidden || commit === null || askedFor.current === commit) return;
		askedFor.current = commit;
		setPreview({ state: 'asking' });
		void window.workspace.storyPreview([]).then((r) => setPreview(r.ok && r.value !== null ? r.value : { state: 'failed', error: r.ok ? 'it gave no answer' : r.error }));
	}, [hidden, commit]);
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
	const primitive = (category: string) => PRIMITIVES.find((p) => p.category === category);
	// A primitive's tokens, by its name: undefined when it has none.
	const tokensOf = (category: string) => found.find(([c]) => c === category)?.[1];
	// What the design system leaves out: a primitive it has no tokens for, or the parts of one it has.
	const missing = PRIMITIVES.flatMap((p) => {
		const list = tokensOf(p.category);
		if (list === undefined) return [{ key: p.category, said: p.category }];
		const parts = missingParts(p, list);
		return parts.length === 0 ? [] : [{ key: p.category, said: `${p.category} ${listed(parts).toLowerCase()}` }];
	});
	const go = (key: string) => sections.current.get(key)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	return (
		<Page>
			<div data-coverage className="flex flex-wrap items-center gap-2">
				{PRIMITIVES.map((p) => {
					const list = tokensOf(p.category);
					const n = list?.length;
					const lacks = missingParts(p, list ?? []);
					const has = (p.parts ?? []).filter((part) => !lacks.includes(part));
					return (
						<Chip key={p.category} defined={n !== undefined} onPress={() => go(n === undefined ? 'not-defined' : p.category)}>
							{n === undefined ? `${p.category} not defined` : lacks.length > 0 && has.length > 0 ? `${p.category} ${n} · ${listed(has).toLowerCase()} only` : `${p.category} ${n}`}
						</Chip>
					);
				})}
				{found
					.filter(([category]) => primitive(category) === undefined)
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
					<Drawn primitive={primitive(category)} tokens={list} byPath={byPath} preview={preview} />
				</section>
			))}
			{missing.length > 0 && (
				<section ref={(el) => void sections.current.set('not-defined', el)} data-not-defined aria-label="Not defined" className="flex scroll-mt-4 flex-col gap-3 border-t pt-6">
					<h2 className="text-base font-semibold">Not defined</h2>
					{read.source === null && <p className="text-muted-foreground text-sm">No tokens were found. Looked for {listed(read.looked)}.</p>}
					<ul className="flex flex-col gap-1.5">
						{missing.map((m) => (
							<li key={m.key} className="text-sm">
								<span className="font-medium">{m.said}</span>
								{read.source !== null && <span className="text-muted-foreground"> Not defined in its {read.source}.</span>}
							</li>
						))}
					</ul>
				</section>
			)}
		</Page>
	);
};
