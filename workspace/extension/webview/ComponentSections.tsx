import type { CatalogComponent, ComponentTokens, DesignToken } from '../../src/shared/contract';
import { plural } from '../../src/shared/plural';
import { inOrder } from '../../src/shared/primitives';
import { labelOf } from '../../src/shared/tokens';
import { useTokenChanges } from './hooks/tokenChanges';
import { sharedWith, useComponentTokens } from './hooks/useComponentTokens';
import { useComponentVariants } from './hooks/useComponentVariants';
import { AccessibilityFindings } from './Accessibility';
import { ComponentValues, type Trying } from './ComponentValues';
import { Grouped, type TokenActions } from './Tokens';
import { AsidePart } from '../../src/ui/AsidePart';
import { InfoTip } from '../../src/ui/InfoTip';
import { ShortList } from '../../src/ui/ShortList';
import { Swatch } from '../../src/ui/Swatch';
import { ValueLine, ValueItem } from '../../src/ui/ValueItem';
import { Message, tryAgain } from '../../src/ui/Message';
import { Heading } from '../../src/ui/Heading';

type Ready = Extract<ComponentTokens, { state: 'ready' }>;

const KINDS: Record<Ready['notTokens'][number]['kind'], string> = { color: 'Colors', radius: 'Radius', spacing: 'Spacing' };

const NotToken = ({ value }: { value: Ready['notTokens'][number] }) => (
	<ValueItem marks={{ 'data-not-token': '' }}>
		<ValueLine>
			{value.kind === 'color' && <Swatch value={value.value} />}
			<span className="token-value">{value.value}</span>
			<span className="token-uses">{plural(value.uses, 'use')}</span>
		</ValueLine>
	</ValueItem>
);

// Exported for its layout test (`componentValuesLayout`), which draws it with the Styles beside it.
export const TokensUsed = ({
	answer,
	tokens,
	info,
	actions,
}: {
	answer: Ready;
	tokens: DesignToken[];
	info: (t: DesignToken) => string;
	actions: TokenActions;
}) => (
	<AsidePart title="Tokens">
		{tokens.length === 0 ? (
			<Message>It draws with none of the design system’s tokens.</Message>
		) : (
			inOrder(tokens, (t) => t.category).map(([category, inCategory]) => (
				<div key={category} data-tokens-used={category} className="value-group">
					<Heading size="group">{category}</Heading>
					<Grouped tokens={inCategory} infoFor={info} {...actions} />
				</div>
			))
		)}
		{(answer.notTokens.length > 0 || answer.derived > 0) && (
			<div data-own-values className="value-group">
				<Heading size="group">
					{/* Together, so the icon is beside the words and not at the far end of the heading. */}
					<span>
						Set in the component itself{' '}
						<InfoTip
							text={`Not tokens, so they are changed in the design system, not here.${
								answer.derived > 0
									? ` ${plural(answer.derived, 'use')} ${answer.derived === 1 ? 'is a shade' : 'are shades'} worked out from a token, such as a hover’s darker color.`
									: ''
							}`}
						/>
					</span>
				</Heading>
				{inOrder(answer.notTokens, (n) => n.kind).map(([kind, values]) => (
					<div key={kind} data-not-token-kind={kind}>
						<Heading size="set">{KINDS[kind]}</Heading>
						<ShortList items={values} row={(n) => <NotToken key={n.value} value={n} />} />
					</div>
				))}
			</div>
		)}
	</AsidePart>
);

export const ComponentSections = ({
	component,
	components,
	actions,
	trying,
}: {
	component: CatalogComponent;
	components: CatalogComponent[];
	actions: TokenActions;
	trying: Trying;
}) => {
	const { byPath } = useTokenChanges();
	const { answer, retry } = useComponentTokens(component.id);
	const variants = useComponentVariants(component.id);

	if (answer.state === 'none' || answer.state === 'building')
		return (
			<Message>
				Finding the tokens {component.name} draws with. The first time for each version of the design system, every story is drawn with each token
				marked, which takes a few seconds.
			</Message>
		);
	if (answer.state === 'failed')
		return (
			<Message size="block" tone="warning" action={tryAgain(retry)}>
				{answer.error}
			</Message>
		);
	const names = new Map(components.map((c) => [c.id, c.name]));
	const tokenName = (path: string) => {
		const t = byPath.get(path);
		return t ? labelOf(t) : path;
	};
	const others = (path: string) => (answer.sharedWith[path] ?? []).map((f) => names.get(f) ?? f);
	const used = new Map(answer.uses.map((u) => [u.path, u.uses]));
	const tokens = answer.uses.flatMap((u) => (byPath.has(u.path) ? [byPath.get(u.path) as DesignToken] : []));
	const info = (t: DesignToken) => `${plural(used.get(t.path) ?? 0, 'use')} · ${sharedWith(others(t.path))}`;
	return (
		<>
			<ComponentValues
				answer={answer}
				name={component.name}
				byPath={byPath}
				tokenName={tokenName}
				others={others}
				trying={trying}
				onEditToken={actions.onEdit}
				variants={variants}
			/>
			<TokensUsed answer={answer} tokens={tokens} info={info} actions={actions} />
			<AsidePart title="Accessibility">
				{answer.accessibility === null ? (
					<Message>Checked once its stories have drawn.</Message>
				) : (
					<AccessibilityFindings result={answer.accessibility} />
				)}
			</AsidePart>
		</>
	);
};
