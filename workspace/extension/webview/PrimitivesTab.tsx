import { type ReactNode, useRef } from 'react';
import { notBuilt, specimenAddress } from '../../src/shared/catalog';
import type { DesignToken } from '../../src/shared/contract';
import { type Primitive, byPrimitive, coverageOf, inOrder, listed, primitiveNamed } from '../../src/shared/primitives';
import { typeSpecimens } from './specimens';
import { nameOf, pixelsOf, readsAs, withEdits } from '../../src/shared/tokens';
import { StoryFrame } from './StoryFrame';
import { ShowingNote } from './Showing';
import { useTabCatalog } from './useCatalog';
import { useTokenEdits } from './shared';
import { TryingNote } from './Changed';
import { Swatch } from './ui/Swatch';
import { type SpecimenPreview, useSpecimenPreview } from './hooks/useSpecimenPreview';
import { Message, tryAgain } from './ui/Message';
import { Heading } from './ui/Heading';

/** The design system's preview build, which a type specimen is drawn in, so its fonts are its own; asked for once. */

/** What every drawing is given: its tokens, every token by its path (to say what one points at), and the preview build. */
interface Drawing {
	tokens: DesignToken[];
	byPath: Map<string, DesignToken>;
	preview: SpecimenPreview;
}

/** Colors: each set in a row of swatches, each captioned with its name and what it points at, or its value. */
const Swatches = ({ tokens, byPath }: Drawing) => (
	<div className="drawn-sets">
		{inOrder(tokens, (t) => `${t.group}/${t.set}`).map(([key, inSet]) => (
			<div key={key} data-primitive-set={key} className="drawn-set">
				<span>{(inSet[0] as DesignToken).set}</span>
				<div className="drawn-swatches">
					{inSet.map((t) => (
						<div key={t.path} data-primitive-token className="drawn-swatch">
							<Swatch value={t.value} large />
							<span className="drawn-name">{t.name}</span>
							<span className="drawn-value">{readsAs(t, byPath)}</span>
						</div>
					))}
				</div>
			</div>
		))}
	</div>
);

/** Spacing: each step a bar as long as it is. */
const Bars = ({ tokens }: Drawing) => (
	<ul className="drawn-bars">
		{tokens.map((t) => {
			const px = pixelsOf(t.value);
			return (
				<li key={t.path} data-primitive-token className="drawn-bar-row">
					<span className="drawn-bar-name">{nameOf(t)}</span>
					{px !== null && <span data-spacing-bar className="drawn-bar" style={{ width: `${px}px` }} />}
					<span className="drawn-value">{t.value}</span>
				</li>
			);
		})}
	</ul>
);

/** A radius: a corner of its size, on a box. */
const Corners = ({ tokens }: Drawing) => (
	<div className="drawn-row">
		{tokens.map((t) => {
			const px = pixelsOf(t.value);
			return (
				<div key={t.path} data-primitive-token className="drawn-item">
					<span data-radius-sample className="drawn-corner" style={px === null ? undefined : { borderRadius: `${px}px` }} />
					<span>{nameOf(t)}</span>
					<span className="drawn-value">{t.value}</span>
				</div>
			);
		})}
	</div>
);

/** Elevation: each shadow on a box it raises, with its name and what it is. */
const Shadows = ({ tokens }: Drawing) => (
	<div className="drawn-row">
		{tokens.map((t) => (
			<div key={t.path} data-primitive-token className="drawn-item drawn-item-wide">
				<span data-shadow-sample className="drawn-shadow" style={{ boxShadow: t.value }} />
				<span>{nameOf(t)}</span>
				<span className="drawn-value">{t.value}</span>
			</div>
		))}
	</div>
);

/** Anything with no drawing of its own: its names and values. */
const Table = ({ tokens }: Drawing) => (
	<table className="drawn-table">
		<thead>
			<tr>
				<th>Name</th>
				<th>Value</th>
			</tr>
		</thead>
		<tbody>
			{tokens.map((t) => (
				<tr key={t.path}>
					<td>{nameOf(t)}</td>
					<td className="drawn-value">{t.value}</td>
				</tr>
			))}
		</tbody>
	</table>
);

/** Typography: a specimen of each family and style, drawn in the design system's own preview, then the values as written. */
const Specimens = ({ tokens, byPath, preview }: Drawing) => (
	<div className="drawn-sets">
		{preview.state === 'ready' ? (
			<div className="stories">
				<StoryFrame src={specimenAddress(preview.base, typeSpecimens(tokens))} title="Type specimen" />
			</div>
		) : preview.state === 'asking' ? (
			<Message>Drawing the type specimen…</Message>
		) : (
			<Message>The specimen is drawn in the design system’s preview, which cannot be built here{notBuilt(preview)}.</Message>
		)}
		<Table tokens={tokens} byPath={byPath} preview={preview} />
	</div>
);

/** Each of the vocabulary's drawings, by the word it uses for it. */
const DRAWINGS: Record<Primitive['drawn'], (props: Drawing) => ReactNode> = {
	swatches: Swatches,
	bars: Bars,
	corners: Corners,
	specimens: Specimens,
	shadows: Shadows,
	table: Table,
};

/** A primitive's tokens as the vocabulary says to draw them, a heading over each group when it has several. */
const Drawn = ({ primitive, tokens, byPath, preview }: { primitive: Primitive | undefined } & Drawing) => {
	const Draw = primitive ? DRAWINGS[primitive.drawn] : Table;
	const draw = (list: DesignToken[]): ReactNode => <Draw tokens={list} byPath={byPath} preview={preview} />;
	const groups = inOrder(tokens, (t) => t.group);
	if (primitive?.parts !== undefined || groups.length === 1) return draw(tokens);
	return (
		<div className="drawn-sets">
			{groups.map(([group, inGroup]) => (
				<div key={group} className="drawn-group">
					<Heading size="label">{group}</Heading>
					{draw(inGroup)}
				</div>
			))}
		</div>
	);
};

/**
 * The Primitives tab (ELECTRON_MIGRATION_PLAN 6.1, the app's R2): the design system seen whole, from the same list the
 * panel shows, as the change being tried there leaves it. A chip for each primitive at the top, how many tokens it has or
 * that it is not defined, each a way to its section; then each drawn as the vocabulary says; then what it does not define,
 * with where DSNR looked. For looking: nothing here changes a token.
 */
export const PrimitivesTab = () => {
	const { ready, note } = useTabCatalog();
	const [tried] = useTokenEdits();
	const sections = useRef(new Map<string, HTMLElement | null>());
	const preview = useSpecimenPreview(ready, true);
	if (note || !ready)
		return (
			<Message size="page" action={tryAgain(note?.onRetry ?? null)}>
				{note?.says ?? ''}
			</Message>
		);

	const read = ready.tokens;
	// A branch handed to Claude Code is shown as it was committed: what is tried waits for the library's own branch.
	const edits = ready.showing === null ? tried : [];
	const tokens = withEdits(read.tokens, edits);
	const byPath = new Map(tokens.map((t) => [t.path, t]));
	const found = byPrimitive(tokens);
	const { chips, missing } = coverageOf(found);
	const go = (key: string) => sections.current.get(key)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	return (
		<main className="tab">
			<header className="tab-header">
				<Heading size="page">Primitives</Heading>
			</header>
			<ShowingNote showing={ready.showing} branch={ready.branch} />
			<div data-coverage className="chips">
				{chips.map((c) => (
					<button
						key={c.key}
						type="button"
						data-primitive-chip
						data-defined={c.defined}
						className={c.defined ? 'chip' : 'chip chip-undefined'}
						onClick={() => go(c.defined ? c.key : 'not-defined')}
					>
						{c.words}
					</button>
				))}
			</div>
			<TryingNote count={edits.length} />
			{found.map(([category, list]) => (
				<section
					key={category}
					ref={(el) => void sections.current.set(category, el)}
					data-primitive={category}
					aria-label={category}
					className="primitive"
				>
					<Heading size="part">{category}</Heading>
					<Drawn primitive={primitiveNamed(category)} tokens={list} byPath={byPath} preview={preview} />
				</section>
			))}
			{missing.length > 0 && (
				<section ref={(el) => void sections.current.set('not-defined', el)} data-not-defined aria-label="Not defined" className="primitive">
					<Heading size="part">Not defined</Heading>
					{read.source === null && <Message>No tokens were found. Looked for {listed(read.looked)}.</Message>}
					<ul className="not-defined">
						{missing.map((m) => (
							<li key={m.key}>
								<strong>{m.said}</strong>
								{read.source !== null && <span className="quiet"> Not defined in its {read.source}.</span>}
							</li>
						))}
					</ul>
				</section>
			)}
		</main>
	);
};
