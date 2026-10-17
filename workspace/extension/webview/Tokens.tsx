import { type ReactNode, useState } from 'react';
import type { DesignToken, DesignTokens } from '../../src/shared/contract';
import { byPrimitive, drawnAs, inOrder, isEditable, listed } from '../../src/shared/primitives';
import { type ColorView, colorSays, labelOf, pointsAt, rowContrast, tokensShown } from '../../src/shared/tokens';
import { useTokenChanges } from '../../src/renderer/tokenChanges';
import { NoMatches } from './ui/NoMatches';
import { EmptyState } from './ui/EmptyState';
import { IconButton } from './ui/IconButton';
import { SearchBox } from './ui/SearchBox';
import { Section } from './ui/Section';
import { Toggle } from './ui/Toggle';
import { SemanticColors } from './SemanticColors';
import { ColorDot } from './ui/ColorDot';

/** What a token row can do: open its control (a token that can be changed), and open its own file at its line. */
export interface TokenActions {
	onEdit: (token: DesignToken) => void;
	onSource: (source: DesignToken['source']) => void;
}

/**
 * A token (`TokenRow`): its name, what it points at, the contrast of its pair when it is the one read under the other
 * (flagged when it is below what the design system's target asks), and its value, all as changed, with a mark when it is.
 * **A color is its name and only its dot** (`ColorDot`), as a color is everywhere: what it points at and its hex are the dot's
 * tooltip, and the dot is what opens its control. Any other token's row is itself the button that opens its control; one
 * that cannot be changed (a font, a shadow) is the same row with nothing to press. Its file and line are its tooltip, and
 * its action opens them.
 */
export const TokenRow = ({ token, note, onEdit, onSource }: { token: DesignToken; note?: ReactNode } & TokenActions) => {
	const changes = useTokenChanges();
	const target = changes.target(token);
	const contrast = rowContrast(token, changes);
	const edited = changes.isChanged(token);
	const where = `${token.source.file}:${token.source.line}`;
	const editable = isEditable(token);
	const name = (
		<span data-part="name" className="token-name">
			{token.name}
		</span>
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
	const parts = (
		<>
			{name}
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
			{token.kind === 'color' ? (
				<div className="token-line">
					{name}
					{pair}
					<ColorDot
						value={token.value}
						says={colorSays(token, target)}
						name={labelOf(token)}
						{...(editable ? { onPress: () => onEdit(token) } : {})}
						{...(edited ? { mark: 'Changed' as const } : {})}
					/>
				</div>
			) : editable ? (
				<button type="button" className="token-line token-button" aria-label={`Change ${labelOf(token)}`} onClick={() => onEdit(token)}>
					{parts}
				</button>
			) : (
				<div className="token-line">{parts}</div>
			)}
			<span className="item-actions">
				<IconButton size="small" icon="go-to-file" label={`Open ${where}`} onClick={() => onSource(token.source)} />
			</span>
			{note && <div className="token-note">{note}</div>}
		</li>
	);
};

/** The sets of some tokens (a tone family's steps, a role's variants): each its name over its tokens, each with `noteFor` its own. */
export const Sets = ({ tokens, noteFor, ...actions }: { tokens: DesignToken[]; noteFor?: (token: DesignToken) => ReactNode } & TokenActions) => (
	<>
		{inOrder(tokens, (t) => `${t.group}/${t.set}`).map(([key, inSet]) => (
			<div key={key} data-token-set={key} className="token-set">
				<h4 className="token-set-name">{(inSet[0] as DesignToken).set}</h4>
				<ul className="tokens" aria-label={(inSet[0] as DesignToken).set}>
					{inSet.map((t) => (
						<TokenRow key={t.path} token={t} {...(noteFor ? { note: noteFor(t) } : {})} {...actions} />
					))}
				</ul>
			</div>
		))}
	</>
);

/**
 * A primitive's or a category's tokens: under a heading for each group when they are in several (Light, Dark, Tones), else
 * their sets; each with `noteFor` its own, when given.
 */
export const Grouped = ({ tokens, noteFor, ...actions }: { tokens: DesignToken[]; noteFor?: (token: DesignToken) => ReactNode } & TokenActions) => {
	const groups = inOrder(tokens, (t) => t.group);
	// One group would say the category's own name again, so its sets are shown directly.
	const notes = noteFor ? { noteFor } : {};
	if (groups.length === 1) return <Sets tokens={tokens} {...notes} {...actions} />;
	return (
		<>
			{groups.map(([group, inGroup]) => (
				<div key={group} data-token-group={group} className="token-group">
					<h3 className="token-group-name">{group}</h3>
					<Sets tokens={inGroup} {...notes} {...actions} />
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
