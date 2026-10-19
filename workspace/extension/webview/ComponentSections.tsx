import type { ReactNode } from 'react';
import type { CatalogComponent, ComponentTokens, DesignToken } from '../../src/shared/contract';
import { plural } from '../../src/shared/plural';
import { inOrder } from '../../src/shared/primitives';
import { labelOf } from '../../src/shared/tokens';
import { useTokenChanges } from './hooks/tokenChanges';
import { sharedWith, useComponentTokens } from './hooks/useComponentTokens';
import { useComponentVariants } from './hooks/useComponentVariants';
import { AccessibilityFindings } from './Accessibility';
import { TokenChanges } from './Changed';
import { ChangeReach } from './ChangeReach';
import { ComponentValues, type Trying } from './ComponentValues';
import { ValueChanges } from './ValueChanges';
import { Grouped, type TokenActions } from './Tokens';
import { AsidePart } from '../../src/ui/AsidePart';
import { Dialog } from '../../src/ui/Dialog';
import { InfoTip } from '../../src/ui/InfoTip';
import { ShortList } from '../../src/ui/ShortList';
import { Swatch } from '../../src/ui/Swatch';
import { ValueLine, ValueItem } from '../../src/ui/ValueItem';
import { Message, tryAgain } from '../../src/ui/Message';
import { Heading } from '../../src/ui/Heading';

type Ready = Extract<ComponentTokens, { state: 'ready' }>;

/** How the values a component sets itself are named, by kind. */
const KINDS: Record<Ready['notTokens'][number]['kind'], string> = { color: 'Colors', radius: 'Radius', spacing: 'Spacing' };

/** A value it sets itself, with its swatch when it is a colour and how often it is used. */
const NotToken = ({ value }: { value: Ready['notTokens'][number] }) => (
	<ValueItem marks={{ 'data-not-token': '' }}>
		<ValueLine>
			{value.kind === 'color' && <Swatch value={value.value} />}
			<span className="token-value">{value.value}</span>
			<span className="token-uses">{plural(value.uses, 'use')}</span>
		</ValueLine>
	</ValueItem>
);

/**
 * Tokens: what its stories draw with, inner parts too (its Styles read each instance's top element alone), laid out as the
 * Styles are, under the Tokens tab's categories, groups and sets. A name opens its file, a value its control; what it sets
 * itself follows, with what that means behind an info icon by its heading.
 */
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

/**
 * What the analysis of a component says, in three parts: its values as an inspector, a variant chosen by its pickers; the
 * tokens it draws with (Tokens); and what axe found. Found by drawing every story with the tokens tagged, the first time
 * for each commit, said while that is done.
 */
export const ComponentSections = ({
	component,
	components,
	actions,
	trying,
	changes,
}: {
	component: CatalogComponent;
	components: CatalogComponent[];
	actions: TokenActions;
	/** The values being tried on its instances, in the stories beside this. */
	trying: Trying;
	/**
	 * Whether its Changes dialog is open (the button in its header opens it), closing it, telling it a branch of its values is kept,
	 * and the panel's Changes, where Save, Propose and Start over are.
	 */
	changes: { open: boolean; onClose: () => void; onKept: (kept: boolean) => void; onActions: () => void };
}) => {
	const { edits, byPath } = useTokenChanges();
	const { answer, retry } = useComponentTokens(component.id);
	// Every case its props declare, drawn: its Styles' pickers offer them too.
	const variants = useComponentVariants(component.id);
	// The changes being tried on it, in a dialog rather than at the top of this column, so nothing moves while a value is
	// adjusted: the token changes (they move its stories too) and what they move, drawn only while it is open, then its values.
	const dialog = (values: ReactNode) =>
		changes.open && (
			<Dialog title="Changes" onClose={changes.onClose}>
				{edits.length === 0 && trying.tried.size === 0 && <Message>Nothing is being tried.</Message>}
				{edits.length > 0 && (
					<>
						<TokenChanges />
						<ChangeReach edits={edits} component={component} components={components} />
					</>
				)}
				{values}
			</Dialog>
		);

	if (answer.state === 'none' || answer.state === 'building')
		return (
			<>
				<Message>
					Finding the tokens {component.name} draws with. The first time for each version of the design system, every story is drawn with each token
					marked, which takes a few seconds.
				</Message>
				{dialog(null)}
			</>
		);
	if (answer.state === 'failed')
		return (
			<>
				<Message size="block" tone="warning" action={tryAgain(retry)}>
					{answer.error}
				</Message>
				{dialog(null)}
			</>
		);
	const names = new Map(components.map((c) => [c.id, c.name]));
	// A token as it is named, and the other components that draw with it: one way for every part.
	const tokenName = (path: string) => {
		const t = byPath.get(path);
		return t ? labelOf(t) : path;
	};
	const others = (path: string) => (answer.sharedWith[path] ?? []).map((f) => names.get(f) ?? f);
	const used = new Map(answer.uses.map((u) => [u.path, u.uses]));
	const tokens = answer.uses.flatMap((u) => (byPath.has(u.path) ? [byPath.get(u.path) as DesignToken] : []));
	// How often a token is used and by whom, behind the info icon beside its name.
	const info = (t: DesignToken) => `${plural(used.get(t.path) ?? 0, 'use')} · ${sharedWith(others(t.path))}`;
	return (
		<>
			<ValueChanges
				component={component}
				components={components}
				rows={answer.values.state === 'read' ? answer.values.rows.light : null}
				trying={trying}
				tokenName={tokenName}
				onKept={changes.onKept}
				onActions={changes.onActions}
			>
				{dialog}
			</ValueChanges>
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
			{/* What axe found is a line and a link, its findings in a dialog. */}
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
