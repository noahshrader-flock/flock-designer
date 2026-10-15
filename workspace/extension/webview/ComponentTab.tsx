import { useState } from 'react';
import { previewAddress, previewProblem } from '../../src/shared/catalog';
import type { CatalogComponent, DesignToken, TokenEdit } from '../../src/shared/contract';
import { undeclared } from '../../src/shared/wcag';
import { TokenChangesProvider, useTokenChangesFor } from '../../src/renderer/tokenChanges';
import { useStoryPreview } from '../../src/renderer/useStoryPreview';
import type { ComponentLink } from '../src/messages';
import { ComponentSections } from './ComponentSections';
import { StoryFrame } from './StoryFrame';
import { TokenEditor } from './TokenEditor';
import type { TokenActions } from './Tokens';
import { useTabCatalog } from './useCatalog';
import { useTrial } from './useTrial';
import { Button } from './ui/Button';
import { Notice, TabNote } from './ui/Notice';
import { TryingNote } from './Changed';
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
 * A component's tab (ELECTRON_MIGRATION_PLAN 6.1): its name and line, its links (Storybook when a hosted one is known, and
 * its source), its stories live, and beside them what its analysis says, in parts (`ComponentSections`). Read from the design system shown, as its catalog
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
			<main className="tab tab-split">
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
						<ComponentSections component={component} components={ready.components} actions={actions} />
					</aside>
				</div>
			</main>
			{editing && <TokenEditor key={editing.path} token={editing} onClose={() => setEditing(null)} />}
		</TokenChangesProvider>
	);
};
