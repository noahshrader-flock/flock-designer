import type { ReactNode } from 'react';
import type { CatalogComponent, ComponentTokens, DesignToken } from '../../src/shared/contract';
import { plural } from '../../src/shared/plural';
import { inOrder } from '../../src/shared/primitives';
import { labelOf } from '../../src/shared/tokens';
import { useTokenChanges } from '../../src/renderer/tokenChanges';
import { MOST_LISTED, sharedWith, useComponentTokens } from '../../src/renderer/useComponentTokens';
import { useComponentVariants } from '../../src/renderer/useComponentVariants';
import { AccessibilityFindings } from './Accessibility';
import { TokenChanges } from './Changed';
import { ChangeReach } from './ChangeReach';
import { ComponentValues, type Trying } from './ComponentValues';
import { ValueChanges } from './ValueChanges';
import { Grouped, type TokenActions } from './Tokens';
import { Dialog } from './ui/Dialog';
import { Disclosure } from './ui/Disclosure';
import { Icon } from './ui/Icon';
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

/**
 * A part kept closed until it is opened, its title the summary that opens it, with how many it holds: what is looked up, not
 * read every time (the tokens it draws with). The browser's own disclosure, so it opens by click and keyboard.
 */
const ClosedPart = ({ title, count, children }: { title: string; count: number; children: ReactNode }) => (
	<section aria-label={title} className="aside-section">
		<details className="disclosure aside-disclosure">
			<summary className="disclosure-summary aside-summary">
				<Icon name="chevron-right" className="disclosure-chevron" />
				<h2 className="aside-title">{title}</h2>
				<span className="section-count">{count}</span>
			</summary>
			{children}
		</details>
	</section>
);

/** How the values a component sets itself are named, by kind. */
const KINDS: Record<Ready['notTokens'][number]['kind'], string> = { color: 'Colors', radius: 'Radius', spacing: 'Spacing' };

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
 * Tokens used (adjusting a component, the inspector's Phase 2): what its stories draw with, read from all they draw, inner
 * parts too, where its Values read each instance's top element alone. How far its tokens reach, in two numbers; each token by
 * its category, then its group and set as the Tokens tab lists them, a row that opens its control, how often it is used and
 * which other components share it under it; then what it sets itself (changed in the design system, not here), the first
 * few of a kind and the rest kept closed, and how many uses are shades worked out from a token. Closed until it is opened.
 */
const TokensUsed = ({
	answer,
	tokens,
	note,
	actions,
}: {
	answer: Ready;
	tokens: DesignToken[];
	note: (t: DesignToken) => ReactNode;
	actions: TokenActions;
}) => {
	const sharing = new Set(Object.values(answer.sharedWith).flat()).size;
	const uses = answer.uses.reduce((total, u) => total + u.uses, 0);
	return (
		<ClosedPart title="Tokens used" count={tokens.length}>
			<p className="quiet" data-usage>
				{`Shares its tokens with ${plural(sharing, 'component')}; ${plural(uses, 'token use')} in its stories drawn.`}
			</p>
			{tokens.length === 0 ? (
				<p className="quiet">It draws with none of the design system’s tokens.</p>
			) : (
				inOrder(tokens, (t) => t.category).map(([category, inCategory]) => (
					<div key={category} data-tokens-used={category} className="token-group">
						<h3 className="token-group-name">{category}</h3>
						<Grouped tokens={inCategory} noteFor={note} {...actions} />
					</div>
				))
			)}
			{(answer.notTokens.length > 0 || answer.derived > 0) && (
				<div data-own-values className="token-group">
					<h3 className="token-group-name">Set in the component itself</h3>
					<p className="quiet">Not tokens, so they are changed in the design system, not here.</p>
					{inOrder(answer.notTokens, (n) => n.kind).map(([kind, values]) => (
						<div key={kind} data-not-token-kind={kind}>
							<h4 className="token-set-name">{KINDS[kind]}</h4>
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
							{plural(answer.derived, 'use')} {answer.derived === 1 ? 'is a shade' : 'are shades'} worked out from a token, such as a hover’s darker
							color.
						</p>
					)}
				</div>
			)}
		</ClosedPart>
	);
};

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
	trying,
	onOpen,
	changes,
}: {
	component: CatalogComponent;
	components: CatalogComponent[];
	actions: TokenActions;
	/** The values being tried on its instances, in the stories beside this. */
	trying: Trying;
	/** Opens another component's tab. */
	onOpen: (id: string) => void;
	/**
	 * Whether its Changes dialog is open (the button beside Ask opens it), closing it, telling it a branch of its values is kept,
	 * and the panel's Changes, where Save, Propose and Start over are.
	 */
	changes: { open: boolean; onClose: () => void; onKept: (kept: boolean) => void; onActions: () => void };
}) => {
	const { edits, byPath } = useTokenChanges();
	const { answer, retry } = useComponentTokens(component.id);
	// Every case its props declare, drawn: its Values' pickers offer them too.
	const variants = useComponentVariants(component.id);
	// The changes being tried on it, in a dialog rather than at the top of this column, so nothing moves while a value is
	// adjusted: the token changes (they move its stories too) and what they move, drawn only while it is open, then its values.
	const dialog = (values: ReactNode) =>
		changes.open && (
			<Dialog title="Changes" onClose={changes.onClose}>
				{edits.length === 0 && trying.tried.size === 0 && <p className="quiet">Nothing is being tried.</p>}
				{edits.length > 0 && (
					<>
						<TokenChanges />
						<ChangeReach edits={edits} component={component} components={components} onOpen={onOpen} />
					</>
				)}
				{values}
			</Dialog>
		);

	if (answer.state === 'none' || answer.state === 'building')
		return (
			<>
				<p className="quiet">
					Finding the tokens {component.name} draws with. The first time for each version of the design system, every story is drawn with each token
					marked, which takes a few seconds.
				</p>
				{dialog(null)}
			</>
		);
	if (answer.state === 'failed')
		return (
			<>
				<Notice onRetry={retry}>{answer.error}</Notice>
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
	const note = (t: DesignToken) => {
		const also = others(t.path);
		return (
			<span data-token-use title={also.join('\n')}>
				{plural(used.get(t.path) ?? 0, 'use')} · {sharedWith(also)}
			</span>
		);
	};
	return (
		<>
			<ValueChanges
				component={component}
				components={components}
				rows={answer.values.state === 'read' ? answer.values.rows.light : null}
				trying={trying}
				tokenName={tokenName}
				onSource={actions.onSource}
				onOpen={onOpen}
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
			<TokensUsed answer={answer} tokens={tokens} note={note} actions={actions} />
			{/* Open: what axe found is one line, its findings already kept closed under it. */}
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
