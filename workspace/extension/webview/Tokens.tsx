import { type ReactNode, useMemo, useState } from 'react';
import type { DesignToken, DesignTokens } from '../../src/shared/contract';
import { PRIMITIVES, byPrimitive, inOrder, isEditable } from '../../src/shared/primitives';
import { contrastPartner, contrastRatio, isForeground, labelOf, nameOf } from '../../src/shared/tokens';
import { textContrast } from '../../src/shared/wcag';
import { opacity, useTokenChanges } from '../../src/renderer/tokenChanges';
import { EmptyState } from './ui/EmptyState';
import { IconButton } from './ui/IconButton';
import { SearchBox } from './ui/SearchBox';
import { Section } from './ui/Section';
import { Toggle } from './ui/Toggle';
import { SemanticColors } from './SemanticColors';
import { Swatch } from './ui/Swatch';

/** What a token row can do: open its control (a token that can be changed), and open its own file at its line. */
export interface TokenActions {
	onEdit?: (token: DesignToken) => void;
	onSource: (source: DesignToken['source']) => void;
}

/**
 * A token, as the app's tokens panel lists one (`TokenRow`): its swatch, its name, what it points at, the contrast of its
 * pair when it is the one read under the other (flagged when it is below what the design system's target asks), and its
 * value, all as changed, with a mark when it is. Pressed, a token that can be changed opens its control; one that cannot
 * (a font, a shadow) is the same row with nothing to press. Its file and line are its tooltip, and its action opens them.
 */
export const TokenRow = ({ token, note, onEdit, onSource }: { token: DesignToken; note?: ReactNode } & TokenActions) => {
	const changes = useTokenChanges();
	const target = changes.target(token);
	const partner = isForeground(token) ? undefined : contrastPartner(token, changes.shown);
	const ratio = partner ? contrastRatio(token.value, partner.value) : null;
	const contrast = ratio === null ? null : textContrast(ratio, changes.accessibility);
	const edited = changes.isChanged(token);
	const where = `${token.source.file}:${token.source.line}`;
	const parts = (
		<>
			{token.kind === 'color' && <Swatch value={token.value} />}
			<span data-part="name" className="token-name">
				{token.name}
			</span>
			{target && (
				<span data-part="ref" className="token-ref">
					{nameOf(target)}
					{token.ref?.alpha && ` at ${opacity(token.ref.alpha)}`}
				</span>
			)}
			{contrast && (
				<span
					data-contrast={ratio}
					className={contrast.flag ? 'token-contrast token-contrast-low' : 'token-contrast'}
					title={`${ratio}:1, ${contrast.words}`}
				>
					{ratio}:1
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
			{onEdit && isEditable(token) ? (
				<button type="button" className="token-line token-button" aria-label={`Change ${labelOf(token)}`} onClick={() => onEdit(token)}>
					{parts}
				</button>
			) : (
				<div className="token-line">{parts}</div>
			)}
			<span className="item-actions">
				<IconButton icon="go-to-file" label={`Open ${where}`} onClick={() => onSource(token.source)} />
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

/** A primitive's or a category's tokens: under a heading for each group when they are in several (Light, Dark, Tones), else their sets. */
export const Grouped = ({ tokens, noteFor, ...actions }: { tokens: DesignToken[]; noteFor?: (token: DesignToken) => ReactNode } & TokenActions) => {
	const groups = inOrder(tokens, (t) => t.group);
	// One group would say the category's own name again, so its sets are shown directly.
	if (groups.length === 1) return <Sets tokens={tokens} {...(noteFor ? { noteFor } : {})} {...actions} />;
	return (
		<>
			{groups.map(([group, inGroup]) => (
				<div key={group} data-token-group={group} className="token-group">
					<h3 className="token-group-name">{group}</h3>
					<Sets tokens={inGroup} {...(noteFor ? { noteFor } : {})} {...actions} />
				</div>
			))}
		</>
	);
};

/** What a token is, in words, for the search to look through: what it points at too, as it is named on screen. */
const searchable = (t: DesignToken, target?: DesignToken) =>
	[t.path, t.category, t.group, t.set, t.name, t.value, t.ref?.path ?? '', target ? nameOf(target) : ''].join(' ').toLowerCase();

/** The two views of the colors, as the app switches them: the roles by theme, and the palette they are made from. */
const COLOR_VIEWS = [
	{ value: 'semantic', label: 'Semantic', icon: 'tag' },
	{ value: 'palette', label: 'Palette', icon: 'symbol-color' },
] as const satisfies { value: ColorView; label: string; icon: string }[];
type ColorView = 'semantic' | 'palette';

/** A role's variant, whichever theme it is in: what a search keeps together, so a match in one theme keeps the others'. */
const rowKey = (t: DesignToken) => `${t.set}\u0000${t.name}`;
const isColors = (category: string) => PRIMITIVES.find((p) => p.category === category)?.drawn === 'swatches';

/**
 * The design system's tokens in the panel, as the app's tokens panel has them (T2, T3): a search, then a section for each
 * primitive in the vocabulary's order, as changed. **Colors have two views,** switched at the left of the search: the
 * roles by theme (`SemanticColors`, the default), a row for each and a column for Light and Dark; and the palette behind
 * them, each tone's steps with their values. A design system with only one of them has only that. With none, what was
 * looked for.
 */
export const TokensView = ({ tokens, ...actions }: { tokens: DesignTokens } & TokenActions) => {
	const changes = useTokenChanges();
	const { isPalette, target } = changes;
	const [search, setSearch] = useState('');
	const [view, setView] = useState<ColorView>('semantic');
	const q = search.trim().toLowerCase();
	const matches = (t: DesignToken) => q === '' || searchable(t, target(t)).includes(q);
	const sections = useMemo(
		() =>
			byPrimitive(changes.shown).map(([category, all]) => {
				if (!isColors(category)) return { category, all, semantic: [], palette: [], shown: all.filter(matches) };
				const semantic = all.filter((t) => !isPalette(t));
				const palette = all.filter(isPalette);
				return { category, all, semantic, palette, shown: [] as DesignToken[] };
			}),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[changes, q],
	);
	if (tokens.source === null || changes.shown.length === 0)
		return (
			<EmptyState icon="symbol-color" title="No tokens were found">
				<p>Looked for {tokens.looked.join(', ')}.</p>
			</EmptyState>
		);
	const choose = sections.some((s) => s.semantic.length > 0 && s.palette.length > 0);
	const drawn = sections.flatMap((s) => {
		if (!isColors(s.category)) return s.shown.length > 0 ? [{ ...s, body: <Grouped tokens={s.shown} {...actions} /> }] : [];
		const which: ColorView = s.semantic.length > 0 && s.palette.length > 0 ? view : s.semantic.length > 0 ? 'semantic' : 'palette';
		if (which === 'palette') {
			const found = s.palette.filter(matches);
			return found.length > 0 ? [{ ...s, shown: found, body: <Grouped tokens={found} {...actions} /> }] : [];
		}
		// A role found in one theme is shown in every theme, so Light and Dark stay side by side.
		const rows = new Set(s.semantic.filter(matches).map(rowKey));
		const found = s.semantic.filter((t) => rows.has(rowKey(t)));
		return found.length > 0 ? [{ ...s, shown: found, body: <SemanticColors tokens={found} onEdit={actions.onEdit ?? (() => undefined)} /> }] : [];
	});
	return (
		<>
			<div className="view-bar">
				{choose && <Toggle label="Color view" options={COLOR_VIEWS} value={view} onChange={setView} iconOnly />}
				<SearchBox label="Search tokens" value={search} onChange={setSearch} />
			</div>
			{drawn.length === 0 ? (
				<p className="note">
					No token matches “{search.trim()}”.{' '}
					<button type="button" className="link" onClick={() => setSearch('')}>
						Clear search
					</button>
				</p>
			) : (
				drawn.map(({ category, shown, body }) => (
					<Section key={category} title={category} count={shown.length}>
						<div className="token-body">{body}</div>
					</Section>
				))
			)}
		</>
	);
};
