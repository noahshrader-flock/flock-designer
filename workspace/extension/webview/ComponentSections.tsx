import type { ReactNode } from 'react';
import type { CatalogComponent, ComponentTokens, DesignToken } from '../../src/shared/contract';
import { counted, plural } from '../../src/shared/plural';
import { inOrder } from '../../src/shared/primitives';
import { useTokenChanges } from '../../src/renderer/tokenChanges';
import { MOST_LISTED, sharedWith, useComponentTokens } from '../../src/renderer/useComponentTokens';
import { AccessibilityFindings } from './Accessibility';
import { ComponentValues, type Trying } from './ComponentValues';
import { SemanticColors } from './SemanticColors';
import { Sets, TokenRow, type TokenActions } from './Tokens';
import { Disclosure } from './ui/Disclosure';
import { Notice } from './ui/Notice';
import { Swatch } from './ui/Swatch';

type Ready = Extract<ComponentTokens, { state: 'ready' }>;

/** One part of what is said of a component, in a bordered box under a title; named for assistive technology by it. */
const Part = ({ title, children }: { title: string; children: ReactNode }) => (
	<section aria-label={title} className="aside-section">
		<h2 className="aside-title">{title}</h2>
		{children}
	</section>
);

/** How the values a component sets itself are named, by kind. */
const KINDS: Record<Ready['notTokens'][number]['kind'], string> = { color: 'Colors', radius: 'Radius', spacing: 'Spacing' };

/**
 * Made from: what it draws with other than colour, a row for each token by what it is (shape, spacing, type), as the
 * panel's rows are, so a change shows here as there and a row opens its control; under each, how often and which other
 * components share it.
 */
const MadeFrom = ({ tokens, note, actions }: { tokens: DesignToken[]; note: (t: DesignToken) => ReactNode; actions: TokenActions }) => (
	<Part title="Made from">
		{tokens.length === 0 ? (
			<p className="quiet">It draws with none of the design system’s tokens other than colours.</p>
		) : (
			inOrder(tokens, (t) => t.category).map(([category, inCategory]) => (
				<div key={category} data-made-from={category} className="token-group">
					<h3 className="token-group-name">{category}</h3>
					<ul className="tokens">
						{inCategory.map((t) => (
							<TokenRow key={t.path} token={t} note={note(t)} {...actions} />
						))}
					</ul>
				</div>
			))
		)}
	</Part>
);

/**
 * Color tokens: the colours it draws with, as the Design System's semantic tokens show them (`SemanticColors`): each
 * role's variants, a column for each theme, a swatch that opens its control. A palette colour it draws with directly is
 * listed after them, as a row.
 */
const ColorTokens = ({
	semantic,
	palette,
	note,
	actions,
}: {
	semantic: DesignToken[];
	palette: DesignToken[];
	note: (t: DesignToken) => ReactNode;
	actions: TokenActions;
}) => (
	<Part title="Color tokens">
		{semantic.length > 0 && <SemanticColors tokens={semantic} onEdit={actions.onEdit} />}
		{palette.length > 0 && <Sets tokens={palette} noteFor={note} {...actions} />}
	</Part>
);

/**
 * Usage: how far its tokens reach, in two numbers, from the analysis of its stories: the other components that draw with
 * any of the same tokens, and how often it uses its own. (How many times it is used in the product's code is not found.)
 */
const Usage = ({ answer }: { answer: Ready }) => {
	const sharing = new Set(Object.values(answer.sharedWith).flat()).size;
	const uses = answer.uses.reduce((total, u) => total + u.uses, 0);
	return (
		<Part title="Usage">
			<dl className="usage">
				<div data-usage="sharing">
					<dt>Shares its tokens with</dt>
					<dd>
						<strong>{sharing}</strong> {counted(sharing, 'component')}
					</dd>
				</div>
				<div data-usage="uses">
					<dt>Token uses</dt>
					<dd>
						<strong>{uses}</strong> {counted(uses, 'use')}
					</dd>
				</div>
			</dl>
		</Part>
	);
};

/** A value it sets itself, with its swatch when it is a colour and how often it is used. */
const NotToken = ({ value }: { value: Ready['notTokens'][number] }) => (
	<li data-not-token className="token">
		<span className="token-line">
			{value.kind === 'color' && <Swatch value={value.value} />}
			<span className="token-value">{value.value}</span>
			<span className="token-uses">{plural(value.uses, 'use')}</span>
		</span>
	</li>
);

/**
 * Non-token values: what it sets in the component itself, so is changed in the design system and not here, grouped by kind
 * with how often each is used; the first few of a kind are listed and the rest are kept closed, said by how many.
 */
const NotTokens = ({ answer }: { answer: Ready }) => (
	<Part title="Non-token values">
		<p className="quiet">Set in the component itself, so they are changed in the design system, not here.</p>
		{inOrder(answer.notTokens, (n) => n.kind).map(([kind, values]) => (
			<div key={kind} data-not-token-kind={kind} className="token-group">
				<h3 className="token-group-name">{KINDS[kind]}</h3>
				<ul className="tokens">
					{values.slice(0, MOST_LISTED).map((n) => (
						<NotToken key={n.value} value={n} />
					))}
				</ul>
				{values.length > MOST_LISTED && (
					<Disclosure label={`Show ${values.length - MOST_LISTED} more`}>
						<ul className="tokens">
							{values.slice(MOST_LISTED).map((n) => (
								<NotToken key={n.value} value={n} />
							))}
						</ul>
					</Disclosure>
				)}
			</div>
		))}
		{answer.derived > 0 && (
			<p className="quiet">
				{plural(answer.derived, 'use')} {answer.derived === 1 ? 'is a shade' : 'are shades'} worked out from a token, such as a hover’s darker color.
			</p>
		)}
	</Part>
);

/**
 * What the analysis of a component says, in parts (T6, decision 29, T7): its drawn values, by variant (Phase 1 of adjusting
 * a component), what it is made from, its colours, how far its
 * tokens reach, the values it sets itself, and what axe found. Found by drawing every story with the tokens tagged, the first
 * time for each commit, said while that is done.
 */
export const ComponentSections = ({
	component,
	components,
	actions,
	version,
	trying,
}: {
	component: CatalogComponent;
	components: CatalogComponent[];
	actions: TokenActions;
	/** The version of the design system shown, which its values are read on. */
	version: { branch: string; commit: string };
	/** The values being tried on its instances, in the stories beside this. */
	trying: Trying;
}) => {
	const { byPath, isPalette } = useTokenChanges();
	const { answer, retry } = useComponentTokens(component.id);

	if (answer === null || answer.state === 'building')
		return (
			<p className="quiet">
				Finding the tokens {component.name} draws with. The first time for each version of the design system, every story is drawn with each token
				marked, which takes a few seconds.
			</p>
		);
	if (answer.state === 'failed') return <Notice onRetry={retry}>{answer.error}</Notice>;
	const names = new Map(components.map((c) => [c.id, c.name]));
	const used = new Map(answer.uses.map((u) => [u.path, u.uses]));
	const tokens = answer.uses.flatMap((u) => (byPath.has(u.path) ? [byPath.get(u.path) as DesignToken] : []));
	const note = (t: DesignToken) => {
		const also = (answer.sharedWith[t.path] ?? []).map((f) => names.get(f) ?? f);
		return (
			<span data-token-use title={also.join('\n')}>
				{plural(used.get(t.path) ?? 0, 'use')} · {sharedWith(also)}
			</span>
		);
	};
	const colors = tokens.filter((t) => t.kind === 'color');
	return (
		<>
			<ComponentValues
				answer={answer}
				name={component.name}
				version={version}
				byPath={byPath}
				names={names}
				trying={trying}
				onEditToken={actions.onEdit}
			/>
			<MadeFrom tokens={tokens.filter((t) => t.kind !== 'color')} note={note} actions={actions} />
			{colors.length > 0 && (
				<ColorTokens semantic={colors.filter((t) => !isPalette(t))} palette={colors.filter(isPalette)} note={note} actions={actions} />
			)}
			<Usage answer={answer} />
			{(answer.notTokens.length > 0 || answer.derived > 0) && <NotTokens answer={answer} />}
			<Part title="Accessibility">
				{answer.accessibility === null ? (
					<p className="quiet">Not checked: its stories did not finish drawing for the check.</p>
				) : (
					<AccessibilityFindings result={answer.accessibility} />
				)}
			</Part>
		</>
	);
};
