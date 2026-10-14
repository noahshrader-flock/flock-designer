import { useCallback, useEffect, useRef, useState } from 'react';
import { countsOf, summaryOf } from '../../src/shared/accessibility';
import { previewAddress } from '../../src/shared/catalog';
import type { Catalog, CatalogComponent, ComponentTokens, DesignToken, StoryPreview, TokenEdit } from '../../src/shared/contract';
import { plural } from '../../src/shared/plural';
import { undeclared } from '../../src/shared/wcag';
import { inOrder } from '../../src/shared/primitives';
import { TokenChangesProvider, useTokenChanges, useTokenChangesFor } from '../../src/renderer/tokenChanges';
import { AccessibilityFindings } from './Accessibility';
import { workspace } from './host';
import { StoryFrame } from './StoryFrame';
import { TokenEditor } from './TokenEditor';
import { Sets, type TokenActions } from './Tokens';
import { useTrial } from './useTrial';
import { Button } from './ui/Button';
import { Swatch } from './ui/Swatch';
import { vscode } from './vscode';

/** The target while the design system is not read yet: nothing is judged at it then. */
const NOT_READ = undeclared('the design system is not read yet');

/** How often the tab asks again while every story is being drawn. */
const ASK_EVERY_MS = 3000;
/** How many of the values a component sets itself are listed before the rest are counted. */
const MOST_LISTED = 8;
/** How many of the other components that share a token are named on its row. */
const MOST_NAMED = 3;

/**
 * Its stories, live, built from the design system's branch, and built again with the change to the tokens being tried
 * (`edits`), as the app's component page builds them: the stories shown stay while it builds, said over them, and a change
 * that cannot be tried says why above them. Only the answer to the newest ask is shown.
 */
const Stories = ({ component, commit, edits }: { component: CatalogComponent; commit: string; edits: TokenEdit[] }) => {
	const [preview, setPreview] = useState<StoryPreview | { state: 'building' }>({ state: 'building' });
	const [trying, setTrying] = useState(false);
	const [refused, setRefused] = useState<string | null>(null);
	const asked = useRef(0);
	const build = useCallback(async (change: TokenEdit[], afresh: boolean) => {
		const ask = ++asked.current;
		if (afresh) setPreview({ state: 'building' });
		setTrying(true);
		const r = await workspace().storyPreview(change);
		if (ask !== asked.current) return;
		const next: StoryPreview = r.ok ? r.value : { state: 'failed', error: r.error };
		setTrying(false);
		const keep = change.length > 0 && next.state === 'failed';
		setRefused(keep ? next.error : null);
		setPreview((shown) => (keep && shown.state === 'ready' ? shown : next));
	}, []);
	const shownCommit = useRef<string | null>(null);
	useEffect(() => {
		const afresh = shownCommit.current !== commit;
		shownCommit.current = commit;
		void build(edits, afresh);
	}, [build, commit, edits]);

	if (preview.state === 'building') return <p className="quiet">Building its previews…</p>;
	if (preview.state !== 'ready')
		return (
			<div className="notice notice-warning">
				<p className="notice-title">Its previews could not be built</p>
				<p>
					{preview.state === 'no-packages'
						? `The design system's packages are not installed in ${preview.root}. Run npm install there, then try again.`
						: preview.state === 'no-library'
							? 'No design system is shown.'
							: preview.error}
				</p>
				<Button onClick={() => void build(edits, true)}>Try again</Button>
			</div>
		);
	return (
		<>
			{refused && (
				<div className="notice notice-warning">
					<p className="notice-title">This change could not be tried</p>
					<p>{refused}</p>
				</div>
			)}
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
	const [answer, setAnswer] = useState<ComponentTokens | null>(null);
	const [asks, setAsks] = useState(0);
	useEffect(() => {
		let live = true;
		let timer: ReturnType<typeof setTimeout> | undefined;
		const ask = async () => {
			const r = await workspace().componentTokens(component.id);
			if (!live) return;
			const next: ComponentTokens = r.ok ? r.value : { state: 'failed', error: r.error };
			setAnswer(next);
			if (next.state === 'building') timer = setTimeout(() => void ask(), ASK_EVERY_MS);
		};
		void ask();
		return () => {
			live = false;
			clearTimeout(timer);
		};
	}, [component.id, asks]);

	if (answer === null || answer.state === 'building')
		return (
			<p className="quiet">
				Finding the tokens {component.name} draws with. The first time for each version of the design system, every story is drawn with each token
				marked, which takes a few seconds.
			</p>
		);
	if (answer.state === 'failed')
		return (
			<div className="notice notice-warning">
				<p>{answer.error}</p>
				<Button onClick={() => setAsks((n) => n + 1)}>Try again</Button>
			</div>
		);
	const names = new Map(components.map((c) => [c.id, c.name]));
	const used = new Map(answer.uses.map((u) => [u.path, u.uses]));
	const tokens = answer.uses.flatMap((u) => (byPath.has(u.path) ? [byPath.get(u.path) as DesignToken] : []));
	const note = (t: DesignToken) => {
		const also = (answer.sharedWith[t.path] ?? []).map((f) => names.get(f) ?? f);
		const shared =
			also.length === 0
				? 'no other component'
				: `also ${also.slice(0, MOST_NAMED).join(', ')}${also.length > MOST_NAMED ? ` and ${also.length - MOST_NAMED} more` : ''}`;
		return (
			<span data-token-use title={also.join('\n')}>
				{plural(used.get(t.path) ?? 0, 'use')} · {shared}
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
	const [catalog, setCatalog] = useState<Catalog | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [edits, setEdits] = useTrial();
	// The token whose control is open: Made from's rows change a token as the panel's do, and every page sees it.
	const [editing, setEditing] = useState<DesignToken | null>(null);
	useEffect(() => {
		vscode().postMessage({ type: 'ready' });
		void workspace()
			.designSystemCatalog(false)
			.then((r) => (r.ok ? setCatalog(r.value) : setError(r.error)));
	}, []);
	const ready = catalog?.state === 'ready' ? catalog : null;
	const changes = useTokenChangesFor(ready?.tokens.tokens ?? [], edits, setEdits, ready?.accessibility ?? NOT_READ);
	const component = ready?.components.find((c) => c.id === id);
	if (error !== null) return <p className="tab-note">{error}</p>;
	if (catalog === null) return <p className="tab-note">Reading the design system…</p>;
	if (!ready || !component) return <p className="tab-note">The design system shown no longer has this component. Close this tab.</p>;
	const actions: TokenActions = { onEdit: setEditing, onSource: ({ file, line }) => vscode().postMessage({ type: 'open-token-source', file, line }) };
	const link = (to: 'storybook' | 'source') => vscode().postMessage({ type: 'component-link', id, link: to });
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
							<Button secondary onClick={() => link('storybook')}>
								Storybook
							</Button>
						)}
						<Button secondary onClick={() => link('source')}>
							Source
						</Button>
					</div>
				</header>
				{edits.length > 0 && <p className="quiet">With the change being tried in the panel ({plural(edits.length, 'token')}).</p>}
				<div className="component-layout">
					<div className="component-stories">
						<Stories component={component} commit={ready.commit} edits={edits} />
					</div>
					<aside className="component-aside">
						<MadeFrom component={component} components={ready.components} actions={actions} />
					</aside>
				</div>
			</main>
			{editing && <TokenEditor token={editing} onClose={() => setEditing(null)} />}
		</TokenChangesProvider>
	);
};
