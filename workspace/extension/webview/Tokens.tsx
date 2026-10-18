import { useState } from 'react';
import type { DesignToken, DesignTokens } from '../../src/shared/contract';
import { byPrimitive, drawnAs, inOrder, isEditable, listed } from '../../src/shared/primitives';
import { type ColorView, labelOf, pointsAt, rowContrast, tokensShown } from '../../src/shared/tokens';
import { useTokenChanges } from '../../src/renderer/tokenChanges';
import { NoMatches } from './ui/NoMatches';
import { EmptyState } from './ui/EmptyState';
import { SearchBox } from './ui/SearchBox';
import { Section } from './ui/Section';
import { Toggle } from './ui/Toggle';
import { SemanticColors } from './SemanticColors';
import { ColorDot, tokenDot } from './ui/ColorDot';
import { InfoTip } from './ui/InfoTip';

/** What a token row can do: open its control (a token that can be changed), and open its own file at its line. */
export interface TokenActions {
	onEdit: (token: DesignToken) => void;
	onSource: (source: DesignToken['source']) => void;
}

/**
 * A token (`TokenRow`): its name, what it points at, the contrast of its pair when it is the one read under the other
 * (flagged when it is below what the design system's target asks), and its value, all as changed, with a mark when it is, laid
 * out as a value is in the Styles: the name at the left, the value flush at the right. **The name is what opens the token's own
 * file at its line**, where it is written: it is a link, and the rest of the row is what opens its control. A color is its name
 * and only its dot (`ColorDot`), as a color is everywhere: its name, and what it points at is the dot's tooltip. Any other
 * token's value is the rest of its row, one button with what it points at; one that cannot be changed (a font, a shadow) has
 * nothing to press there. Its file and line are the row's tooltip.
 */
export const TokenRow = ({ token, info, onEdit, onSource }: { token: DesignToken; info?: string } & TokenActions) => {
	const changes = useTokenChanges();
	const target = changes.target(token);
	const contrast = rowContrast(token, changes);
	const edited = changes.isChanged(token);
	const where = `${token.source.file}:${token.source.line}`;
	const editable = isEditable(token);
	// Its name, a link to where it is written, with what is good to know of it behind an info icon beside it.
	const name = (
		<>
			<button
				type="button"
				data-part="name"
				className="token-name token-link"
				aria-label={`${token.name}: open ${where}`}
				onClick={() => onSource(token.source)}
			>
				{token.name}
			</button>
			{info && <InfoTip text={info} />}
		</>
	);
	const pair = contrast && (
		<span
			data-contrast={contrast.ratio}
			className={contrast.flag ? 'token-contrast token-contrast-low' : 'token-contrast'}
			title={`${contrast.ratio}:1, ${contrast.words}`}
		>
			{contrast.ratio}:1
		</span>
	);
	// What is at the right of a length, a duration, a font: what it points at, its value, a mark when changed.
	const value = (
		<>
			{target && (
				<span data-part="ref" className="token-ref">
					{pointsAt(token, target)}
				</span>
			)}
			<span data-part="value" className="token-value">
				{token.value}
			</span>
			{edited && <span data-changed-mark className="token-changed" aria-label="Changed" />}
		</>
	);
	return (
		<li className="token" data-token={token.path} data-changed={edited || undefined} title={where}>
			<div className="token-line token-line-flush">
				{name}
				{token.kind === 'color' ? (
					<>
						{pair}
						<ColorDot
							{...tokenDot(token)}
							{...(editable ? { onPress: () => onEdit(token) } : {})}
							{...(edited ? { mark: 'Changed' as const } : {})}
						/>
					</>
				) : editable ? (
					<button type="button" className="token-fill token-button" aria-label={`Change ${labelOf(token)}`} onClick={() => onEdit(token)}>
						{value}
					</button>
				) : (
					<span className="token-fill">{value}</span>
				)}
			</div>
		</li>
	);
};

/** The sets of some tokens (a tone family's steps, a role's variants): each its name over its tokens, each with `infoFor` its own, behind an info icon. */
export const Sets = ({ tokens, infoFor, ...actions }: { tokens: DesignToken[]; infoFor?: (token: DesignToken) => string } & TokenActions) => (
	<>
		{inOrder(tokens, (t) => `${t.group}/${t.set}`).map(([key, inSet]) => (
			<div key={key} data-token-set={key} className="token-set">
				<h4 className="token-set-name">{(inSet[0] as DesignToken).set}</h4>
				<ul className="tokens" aria-label={(inSet[0] as DesignToken).set}>
					{inSet.map((t) => (
						<TokenRow key={t.path} token={t} {...(infoFor ? { info: infoFor(t) } : {})} {...actions} />
					))}
				</ul>
			</div>
		))}
	</>
);

/**
 * A primitive's or a category's tokens: under a heading for each group when they are in several (Light, Dark, Tones), else
 * their sets; each with `infoFor` its own, when given.
 */
export const Grouped = ({ tokens, infoFor, ...actions }: { tokens: DesignToken[]; infoFor?: (token: DesignToken) => string } & TokenActions) => {
	const groups = inOrder(tokens, (t) => t.group);
	// One group would say the category's own name again, so its sets are shown directly.
	const infos = infoFor ? { infoFor } : {};
	if (groups.length === 1) return <Sets tokens={tokens} {...infos} {...actions} />;
	return (
		<>
			{groups.map(([group, inGroup]) => (
				<div key={group} data-token-group={group} className="token-group">
					<h3 className="token-group-name">{group}</h3>
					<Sets tokens={inGroup} {...infos} {...actions} />
				</div>
			))}
		</>
	);
};

/** The two views of the colors, as the app switches them: the roles by theme, and the palette they are made from. */
const COLOR_VIEWS = [
	{ value: 'semantic', label: 'Semantic', icon: 'tag' },
	{ value: 'palette', label: 'Palette', icon: 'symbol-color' },
] as const satisfies { value: ColorView; label: string; icon: string }[];

/**
 * The design system's tokens in the panel (T2, T3), by the same rule (`tokensShown`):
 * a search, then a section for each primitive in the vocabulary's order, as changed. **Colors have two views,** switched
 * at the left of the search: the roles by theme (`SemanticColors`, the default), a row for each and a column for Light
 * and Dark; and the palette behind them, each tone's steps with their values. With no tokens, what was looked for.
 */
export const TokensView = ({ tokens, ...actions }: { tokens: DesignTokens } & TokenActions) => {
	const changes = useTokenChanges();
	const [search, setSearch] = useState('');
	const [view, setView] = useState<ColorView>('semantic');
	if (tokens.source === null || changes.shown.length === 0)
		return (
			<EmptyState icon="symbol-color" title="No tokens were found">
				<p>Looked for {listed(tokens.looked)}.</p>
			</EmptyState>
		);
	const categories = byPrimitive(changes.shown).map(([category, all]) => ({
		category,
		...tokensShown(all, { colors: drawnAs(category) === 'swatches', isPalette: changes.isPalette, view, query: search, target: changes.target }),
	}));
	const found = categories.filter((c) => c.shown.length > 0);
	return (
		<>
			<div className="view-bar">
				{categories.some((c) => c.choose) && <Toggle label="Color view" options={COLOR_VIEWS} value={view} onChange={setView} iconOnly />}
				<SearchBox label="Search tokens" value={search} onChange={setSearch} />
			</div>
			{found.length === 0 ? (
				<NoMatches thing="token" search={search} onClear={() => setSearch('')} />
			) : (
				found.map(({ category, view: shownView, shown }) => (
					<Section key={category} title={category} count={shown.length}>
						<div className="token-body">
							{shownView === 'semantic' ? <SemanticColors tokens={shown} onEdit={actions.onEdit} /> : <Grouped tokens={shown} {...actions} />}
						</div>
					</Section>
				))
			)}
		</>
	);
};
