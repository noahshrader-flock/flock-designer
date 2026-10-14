import { type ReactNode, useMemo, useState } from 'react';
import type { DesignToken, DesignTokens } from '../../src/shared/contract';
import { byPrimitive, inOrder, isEditable } from '../../src/shared/primitives';
import { contrastPartner, contrastRatio, isForeground, labelOf, nameOf } from '../../src/shared/tokens';
import { textContrast } from '../../src/shared/wcag';
import { opacity, useTokenChanges } from '../../src/renderer/tokenChanges';
import { EmptyState } from './ui/EmptyState';
import { IconButton } from './ui/IconButton';
import { SearchBox } from './ui/SearchBox';
import { Section } from './ui/Section';
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

/**
 * The design system's tokens in the panel (T2, T3 of the design system plan, rebuilt in VS Code's language): a search, then
 * a section for each primitive in the vocabulary's order, each with how many it has, its groups and sets under it, as
 * changed. With none, what was looked for.
 */
export const TokensView = ({ tokens, ...actions }: { tokens: DesignTokens } & TokenActions) => {
	const changes = useTokenChanges();
	const [search, setSearch] = useState('');
	const q = search.trim().toLowerCase();
	const shown = useMemo(() => (q === '' ? changes.shown : changes.shown.filter((t) => searchable(t, changes.target(t)).includes(q))), [changes, q]);
	if (tokens.source === null || changes.shown.length === 0)
		return (
			<EmptyState icon="symbol-color" title="No tokens were found">
				<p>Looked for {tokens.looked.join(', ')}.</p>
			</EmptyState>
		);
	return (
		<>
			<div className="view-bar">
				<SearchBox label="Search tokens" value={search} onChange={setSearch} />
			</div>
			{shown.length === 0 ? (
				<p className="note">
					No token matches “{search.trim()}”.{' '}
					<button type="button" className="link" onClick={() => setSearch('')}>
						Clear search
					</button>
				</p>
			) : (
				byPrimitive(shown).map(([category, inCategory]) => (
					<Section key={category} title={category} count={inCategory.length}>
						<div className="token-body">
							<Grouped tokens={inCategory} {...actions} />
						</div>
					</Section>
				))
			)}
		</>
	);
};
