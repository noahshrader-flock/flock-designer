import { type ReactNode, useEffect, useRef, useState } from 'react';
import { specimenAddress } from '../../src/shared/catalog';
import type { Catalog, DesignToken, StoryPreview } from '../../src/shared/contract';
import { plural } from '../../src/shared/plural';
import { PRIMITIVES, type Primitive, byPrimitive, inOrder, missingParts } from '../../src/shared/primitives';
import { typeSpecimens } from '../../src/shared/specimens';
import { nameOf, pixelsOf, readsAs, withEdits } from '../../src/shared/tokens';
import { workspace } from './host';
import { StoryFrame } from './StoryFrame';
import { useTrial } from './useTrial';
import { Swatch } from './ui/Swatch';
import { vscode } from './vscode';

/** The design system's preview build, which a type specimen is drawn in, so its fonts are its own; asked for once. */
type Preview = StoryPreview | { state: 'asking' };

/** What every drawing is given: its tokens, every token by its path (to say what one points at), and the preview build. */
interface Drawing {
	tokens: DesignToken[];
	byPath: Map<string, DesignToken>;
	preview: Preview;
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
							<Swatch value={t.value} wide />
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

/** Why a specimen cannot be drawn, from what the preview build said. */
const notBuilt = (preview: StoryPreview): string =>
	preview.state === 'no-packages'
		? `: its packages are not installed (run npm install in ${preview.root})`
		: preview.state === 'failed'
			? `: ${preview.error}`
			: '';

/** Typography: a specimen of each family and style, drawn in the design system's own preview, then the values as written. */
const Specimens = ({ tokens, byPath, preview }: Drawing) => (
	<div className="drawn-sets">
		{preview.state === 'ready' ? (
			<div className="stories">
				<StoryFrame src={specimenAddress(preview.base, typeSpecimens(tokens))} title="Type specimen" />
			</div>
		) : preview.state === 'asking' ? (
			<p className="quiet">Drawing the type specimen…</p>
		) : (
			<p className="quiet">The specimen is drawn in the design system’s preview, which cannot be built here{notBuilt(preview)}.</p>
		)}
		<Table tokens={tokens} byPath={byPath} preview={preview} />
	</div>
);

/** Each of the vocabulary's drawings, by the word it uses for it, as the app's Primitives has them. */
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
					<h3 className="token-group-name">{group}</h3>
					{draw(inGroup)}
				</div>
			))}
		</div>
	);
};

/** "theme files, CSS variables and design token files". */
const listed = (words: string[]): string => (words.length < 2 ? (words[0] ?? '') : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`);

/**
 * The Primitives tab (ELECTRON_MIGRATION_PLAN 6.1, the app's R2): the design system seen whole, from the same list the
 * panel shows, as the change being tried there leaves it. A chip for each primitive at the top, how many tokens it has or
 * that it is not defined, each a way to its section; then each drawn as the vocabulary says; then what it does not define,
 * with where DSNR looked. For looking: nothing here changes a token.
 */
export const PrimitivesTab = () => {
	const [catalog, setCatalog] = useState<Catalog | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [edits] = useTrial();
	const [preview, setPreview] = useState<Preview>({ state: 'asking' });
	const sections = useRef(new Map<string, HTMLElement | null>());
	useEffect(() => {
		vscode().postMessage({ type: 'ready' });
		void workspace()
			.designSystemCatalog(false)
			.then((r) => (r.ok ? setCatalog(r.value) : setError(r.error)));
	}, []);
	const ready = catalog?.state === 'ready' ? catalog : null;
	const specimens = ready?.tokens.tokens.some((t) => PRIMITIVES.find((p) => p.category === t.category)?.drawn === 'specimens') ?? false;
	useEffect(() => {
		if (!specimens) return;
		void workspace()
			.storyPreview([])
			.then((r) => setPreview(r.ok ? r.value : { state: 'failed', error: r.error }));
	}, [specimens]);
	if (error !== null) return <p className="tab-note">{error}</p>;
	if (catalog === null) return <p className="tab-note">Reading the design system…</p>;
	if (!ready) return <p className="tab-note">The design system could not be read: the panel says why.</p>;

	const read = ready.tokens;
	const tokens = withEdits(read.tokens, edits);
	const byPath = new Map(tokens.map((t) => [t.path, t]));
	const found = byPrimitive(tokens);
	const primitive = (category: string) => PRIMITIVES.find((p) => p.category === category);
	const tokensOf = (category: string) => found.find(([c]) => c === category)?.[1];
	const missing = PRIMITIVES.flatMap((p) => {
		const list = tokensOf(p.category);
		if (list === undefined) return [{ key: p.category, said: p.category }];
		const parts = missingParts(p, list);
		return parts.length === 0 ? [] : [{ key: p.category, said: `${p.category} ${listed(parts).toLowerCase()}` }];
	});
	const go = (key: string) => sections.current.get(key)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	const chip = (key: string, defined: boolean, words: string) => (
		<button
			key={key}
			type="button"
			data-primitive-chip
			data-defined={defined}
			className={defined ? 'chip' : 'chip chip-undefined'}
			onClick={() => go(defined ? key : 'not-defined')}
		>
			{words}
		</button>
	);
	return (
		<main className="tab">
			<header className="tab-header">
				<h1 className="tab-title">Primitives</h1>
			</header>
			<div data-coverage className="chips">
				{PRIMITIVES.map((p) => {
					const n = tokensOf(p.category)?.length;
					const lacks = missingParts(p, tokensOf(p.category) ?? []);
					const has = (p.parts ?? []).filter((part) => !lacks.includes(part));
					return chip(
						p.category,
						n !== undefined,
						n === undefined
							? `${p.category} not defined`
							: lacks.length > 0 && has.length > 0
								? `${p.category} ${n} · ${listed(has).toLowerCase()} only`
								: `${p.category} ${n}`,
					);
				})}
				{found
					.filter(([category]) => primitive(category) === undefined)
					.map(([category, list]) => chip(category, true, `${category} ${list.length}`))}
			</div>
			{edits.length > 0 && <p className="quiet">Showing the change being tried in the panel ({plural(edits.length, 'token')}).</p>}
			{found.map(([category, list]) => (
				<section
					key={category}
					ref={(el) => void sections.current.set(category, el)}
					data-primitive={category}
					aria-label={category}
					className="primitive"
				>
					<h2 className="primitive-title">{category}</h2>
					<Drawn primitive={primitive(category)} tokens={list} byPath={byPath} preview={preview} />
				</section>
			))}
			{missing.length > 0 && (
				<section ref={(el) => void sections.current.set('not-defined', el)} data-not-defined aria-label="Not defined" className="primitive">
					<h2 className="primitive-title">Not defined</h2>
					{read.source === null && <p className="quiet">No tokens were found. Looked for {listed(read.looked)}.</p>}
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
