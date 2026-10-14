import { useState } from 'react';
import { countsOf, summaryOf } from '../../src/shared/accessibility';
import { previewAddress, previewProblem } from '../../src/shared/catalog';
import type { CatalogComponent, DesignToken, TokenEdit } from '../../src/shared/contract';
import { plural } from '../../src/shared/plural';
import { undeclared } from '../../src/shared/wcag';
import { inOrder } from '../../src/shared/primitives';
import { TokenChangesProvider, useTokenChanges, useTokenChangesFor } from '../../src/renderer/tokenChanges';
import { MOST_LISTED, sharedWith, useComponentTokens } from '../../src/renderer/useComponentTokens';
import { useStoryPreview } from '../../src/renderer/useStoryPreview';
import type { ComponentLink } from '../src/messages';
import { AccessibilityFindings } from './Accessibility';
import { StoryFrame } from './StoryFrame';
import { TokenEditor } from './TokenEditor';
import { Sets, type TokenActions } from './Tokens';
import { useTabCatalog } from './useCatalog';
import { useTrial } from './useTrial';
import { Button } from './ui/Button';
import { Notice, TabNote } from './ui/Notice';
import { TryingNote } from './Changed';
import { Swatch } from './ui/Swatch';
import { vscode } from './vscode';

/** The target while the design system is not read yet: nothing is judged at it then. */
const NOT_READ = undeclared('the design system is not read yet');

/**
 * Its stories, live, built as the app's component page builds them (`useStoryPreview`): with the change to the tokens
 * being tried, the stories shown stay while it builds, said over them, and a change that cannot be tried says why.
 */
const Stories = ({ component, commit, edits }: { component: CatalogComponent; commit: string; edits: TokenEdit[] }) => {
	const { preview, trying, refused, retry } = useStoryPreview(commit, edits);
	if (preview.state === 'building') return <p className="quiet">Building its previews…</p>;
	if (preview.state !== 'ready')
		return (
			<Notice title="Its previews could not be built" onRetry={retry}>
				{previewProblem(preview)}
			</Notice>
		);
	return (
		<>
			{refused && <Notice title="This change could not be tried">{refused}</Notice>}
			<div className="stories" aria-busy={trying}>
				<StoryFrame src={previewAddress(preview.base, component.id)} title={component.name} />
				{trying && <p className="stories-building">Building…</p>}
			</div>
		</>
	);
};

/**
 * Made from (T6, decision 29): the design system's tokens it draws with, as the panel's rows, so a change shows here as
 * there; under each, how often and which other components share it. Then Not tokens, what it sets itself, and what axe
 * found in its stories (T7). Found by drawing every story with the tokens tagged, the first time for each commit.
 */
const MadeFrom = ({ component, components, actions }: { component: CatalogComponent; components: CatalogComponent[]; actions: TokenActions }) => {
	const { byPath } = useTokenChanges();
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
	return (
		<>
			<section aria-label="Made from" className="aside-section">
				<h2 className="aside-title">Made from</h2>
				{tokens.length === 0 ? (
					<p className="quiet">{component.name} draws with none of the design system’s tokens.</p>
				) : (
					inOrder(tokens, (t) => t.category).map(([category, inCategory]) => (
						<div key={category} data-made-from={category} className="token-group">
							<h3 className="token-group-name">{category}</h3>
							<Sets tokens={inCategory} noteFor={note} {...actions} />
						</div>
					))
				)}
			</section>
			{(answer.notTokens.length > 0 || answer.derived > 0) && (
				<section aria-label="Not tokens" className="aside-section">
					<h2 className="aside-title">Not tokens</h2>
					<p className="quiet">Set in the component itself, so they are changed in the design system, not here.</p>
					<ul className="tokens">
						{answer.notTokens.slice(0, MOST_LISTED).map((n) => (
							<li key={`${n.kind} ${n.value}`} data-not-token className="token">
								<span className="token-line">
									{n.kind === 'color' && <Swatch value={n.value} />}
									<span className="token-name">{n.kind}</span>
									<span className="token-value">{n.value}</span>
									<span className="token-uses">{plural(n.uses, 'use')}</span>
								</span>
							</li>
						))}
					</ul>
					{answer.notTokens.length > MOST_LISTED && <p className="quiet">And {answer.notTokens.length - MOST_LISTED} more.</p>}
					{answer.derived > 0 && (
						<p className="quiet">
							{plural(answer.derived, 'use')} {answer.derived === 1 ? 'is a shade' : 'are shades'} worked out from a token, such as a hover’s darker
							color.
						</p>
					)}
				</section>
			)}
			<section aria-label="Accessibility" className="aside-section">
				<h2 className="aside-title">Accessibility</h2>
				{answer.accessibility === null ? (
					<p className="quiet">Not checked: its stories did not finish drawing for the check.</p>
				) : (
					<>
						<p data-accessibility-summary className={answer.accessibility.violations.length ? 'warning-text' : undefined}>
							{summaryOf(countsOf(answer.accessibility))}
						</p>
						<AccessibilityFindings result={answer.accessibility} />
					</>
				)}
			</section>
		</>
	);
};

/**
 * A component's tab (ELECTRON_MIGRATION_PLAN 6.1): its name and line, its links (Storybook when a hosted one is known, and
 * its source), its stories live, and beside them what it is made from. Read from the design system shown, as its catalog
 * lists it now; the change to the tokens being tried is the extension's, so a change made in the panel is seen here.
 */
export const ComponentTab = ({ id }: { id: string }) => {
	const { ready, note } = useTabCatalog();
	const [edits, setEdits] = useTrial();
	// The token whose control is open: Made from's rows change a token as the panel's do, and every page sees it.
	const [editing, setEditing] = useState<DesignToken | null>(null);
	const changes = useTokenChangesFor(ready?.tokens.tokens ?? [], edits, setEdits, ready?.accessibility ?? NOT_READ);
	const component = ready?.components.find((c) => c.id === id);
	if (note) return <TabNote note={note.says} onRetry={note.onRetry} />;
	if (!ready || !component) return <TabNote note="The design system shown no longer has this component. Close this tab." />;
	const actions: TokenActions = { onEdit: setEditing, onSource: ({ file, line }) => vscode().postMessage({ type: 'open-token-source', file, line }) };
	const link = (to: ComponentLink) => vscode().postMessage({ type: 'component-link', id, link: to });
	return (
		<TokenChangesProvider value={changes}>
			<main className="tab">
				<header className="tab-header">
					<div className="tab-heading">
						<h1 className="tab-title">{component.name}</h1>
						<p className="quiet">{component.subtitle ?? component.group}</p>
					</div>
					<div className="tab-actions">
						{component.storybook !== null && (
							<Button variant="secondary" onClick={() => link('storybook')}>
								Storybook
							</Button>
						)}
						<Button variant="secondary" onClick={() => link('source')}>
							Source
						</Button>
					</div>
				</header>
				<TryingNote count={edits.length} />
				<div className="component-layout">
					<div className="component-stories">
						<Stories component={component} commit={ready.commit} edits={edits} />
					</div>
					<aside className="component-aside">
						<MadeFrom component={component} components={ready.components} actions={actions} />
					</aside>
				</div>
			</main>
			{editing && <TokenEditor key={editing.path} token={editing} onClose={() => setEditing(null)} />}
		</TokenChangesProvider>
	);
};
