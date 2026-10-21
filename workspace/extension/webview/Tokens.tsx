import { useState } from 'react';
import type { DesignToken, DesignTokens } from '../../src/shared/contract';
import { byPrimitive, drawnAs, inOrder, isEditable, listed } from '../../src/shared/primitives';
import { type ColorView, labelOf, pointsAt, rowContrast, tokensShown } from '../../src/shared/tokens';
import { useTokenChanges } from './hooks/tokenChanges';
import { NoMatches } from '../../src/ui/NoMatches';
import { SearchBox } from '../../src/ui/SearchBox';
import { Section } from '../../src/ui/Section';
import { Toggle } from '../../src/ui/Toggle';
import { SemanticColors } from './SemanticColors';
import { ColorDot } from '../../src/ui/ColorDot';
import { tokenDot } from './tokenDot';
import { InfoTip } from '../../src/ui/InfoTip';
import { ValueItem, ValueLine, ValueList } from '../../src/ui/ValueItem';
import { Message } from '../../src/ui/Message';
import { Heading } from '../../src/ui/Heading';
import { asks } from './host';
import { ChangedMark } from '../../src/ui/ChangedMark';

export interface TokenActions {
	onEdit: (token: DesignToken) => void;
}

const TokenRow = ({ token, info, onEdit }: { token: DesignToken; info?: string } & TokenActions) => {
	const changes = useTokenChanges();
	const target = changes.target(token);
	const contrast = rowContrast(token, changes);
	const edited = changes.isChanged(token);
	const where = `${token.source.file}:${token.source.line}`;
	const editable = isEditable(token);
	const name = (
		<>
			<button
				type="button"
				data-part="name"
				className="token-name token-link"
				aria-label={`${token.name}: open ${where}`}
				onClick={() => void asks().openLibrarySource(token.source.file, token.source.line)}
			>
				{token.name}
			</button>
			{info && <InfoTip text={info} />}
		</>
	);
	const pair = contrast && (
		<span
			data-contrast={contrast.ratio}
			className={contrast.flag ? 'token-contrast warning-text' : 'token-contrast'}
			title={`${contrast.ratio}:1, ${contrast.words}`}
		>
			{contrast.ratio}:1
		</span>
	);
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
			{edited && <ChangedMark says="Changed" />}
		</>
	);
	return (
		<ValueItem marks={{ 'data-token': token.path, 'data-changed': edited || undefined }} title={where}>
			<ValueLine>
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
			</ValueLine>
		</ValueItem>
	);
};

export const Sets = ({ tokens, infoFor, ...actions }: { tokens: DesignToken[]; infoFor?: (token: DesignToken) => string } & TokenActions) => (
	<>
		{inOrder(tokens, (t) => `${t.group}/${t.set}`).map(([key, inSet]) => (
			<div key={key} data-token-set={key} className="token-set">
				<Heading size="set">{(inSet[0] as DesignToken).set}</Heading>
				<ValueList label={(inSet[0] as DesignToken).set}>
					{inSet.map((t) => (
						<TokenRow key={t.path} token={t} {...(infoFor ? { info: infoFor(t) } : {})} {...actions} />
					))}
				</ValueList>
			</div>
		))}
	</>
);

export const Grouped = ({ tokens, infoFor, ...actions }: { tokens: DesignToken[]; infoFor?: (token: DesignToken) => string } & TokenActions) => {
	const groups = inOrder(tokens, (t) => t.group);
	// One group would say the category's own name again, so its sets are shown directly.
	const infos = infoFor ? { infoFor } : {};
	if (groups.length === 1) return <Sets tokens={tokens} {...infos} {...actions} />;
	return (
		<>
			{groups.map(([group, inGroup]) => (
				<div key={group} data-token-group={group} className="token-group">
					<Heading size="label">{group}</Heading>
					<Sets tokens={inGroup} {...infos} {...actions} />
				</div>
			))}
		</>
	);
};

const COLOR_VIEWS = [
	{ value: 'semantic', label: 'Semantic', icon: 'tag' },
	{ value: 'palette', label: 'Palette', icon: 'symbol-color' },
] as const satisfies { value: ColorView; label: string; icon: string }[];

export const TokensView = ({ tokens, ...actions }: { tokens: DesignTokens } & TokenActions) => {
	const changes = useTokenChanges();
	const [search, setSearch] = useState('');
	const [view, setView] = useState<ColorView>('semantic');
	if (tokens.source === null || changes.shown.length === 0)
		return (
			<Message size="page" icon="symbol-color" title="No tokens were found">
				<p>Looked for {listed(tokens.looked)}.</p>
			</Message>
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
