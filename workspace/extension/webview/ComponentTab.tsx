import { useEffect, useState } from 'react';
import { previewAddress, previewProblem } from '../../src/shared/catalog';
import type { CatalogComponent, DesignToken, TokenEdit, TriedValue } from '../../src/shared/contract';
import { triedId } from '../../src/shared/contract';
import { plural } from '../../src/shared/plural';
import { undeclared } from '../../src/shared/wcag';
import { TokenChangesProvider, useTokenChangesFor } from '../../src/renderer/tokenChanges';
import { useStoryPreview } from '../../src/renderer/useStoryPreview';
import type { ComponentLink } from '../src/messages';
import { AskInWords } from './AskInWords';
import { ComponentSections } from './ComponentSections';
import { StoryFrame } from './StoryFrame';
import { TokenEditor } from './TokenEditor';
import type { TokenActions } from './Tokens';
import { useTabCatalog } from './useCatalog';
import { useTrial } from './useTrial';
import { ModeProvider } from './mode';
import { useModeChoice } from './useModeChoice';
import { Button } from './ui/Button';
import { Notice, TabNote } from './ui/Notice';
import { workspace } from './host';
import { vscode } from './vscode';

/** The target while the design system is not read yet: nothing is judged at it then. */
const NOT_READ = undeclared('the design system is not read yet');

/**
 * Its stories, live, built as the app's component page builds them (`useStoryPreview`): with the change to the tokens
 * being tried, the stories shown stay while it builds, said over them, and a change that cannot be tried says why.
 */
const Stories = ({ component, commit, edits, tried }: { component: CatalogComponent; commit: string; edits: TokenEdit[]; tried: TriedValue[] }) => {
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
				<StoryFrame src={previewAddress(preview.base, component.id)} title={component.name} tried={tried} />
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
	// The mode its values are shown in: the one chosen in the panel, the same on every page.
	const mode = useModeChoice();
	const [chosen] = mode;
	// The token whose control is open: Made from's rows change a token as the panel's do, and every page sees it.
	const [editing, setEditing] = useState<DesignToken | null>(null);
	// Asking in words (Phase 6): open while its dialog is.
	const [asking, setAsking] = useState(false);
	// Its Changes dialog: what is tried on it and the token changes, from the button beside Ask.
	const [changesOpen, setChangesOpen] = useState(false);
	// Whether a branch of its values is kept: then the button can be pressed with nothing tried, to propose or leave it.
	const [kept, setKept] = useState(false);
	const changes = useTokenChangesFor(ready?.tokens.tokens ?? [], edits, setEdits, ready?.accessibility ?? NOT_READ);
	// The values tried on its instances (Phase 2): this tab's alone, kept nowhere, and forgotten when the design system moves
	// to another version, whose instances are drawn anew, or another mode is chosen, so a value tried in one is never left on the other.
	const [tried, setTried] = useState<ReadonlyMap<string, TriedValue>>(new Map());
	useEffect(() => setTried(new Map()), [ready?.commit, chosen]);
	const onAll = (all: TriedValue[]) => setTried(new Map(all.map((t) => [triedId(t), t])));
	// Having the agent write a value (Phase 4.5, 4.6): asked of the core, which says what it wrote where its values are.
	const [writes, setWrites] = useState(0);
	const [writeError, setWriteError] = useState<string | null>(null);
	const onWrite = (value: TriedValue) =>
		void workspace()
			.writeValue(id, value)
			.then((r) => {
				setWriteError(r.ok ? null : r.error);
				setWrites((n) => n + 1);
			});
	// A value that follows a token is written by the agent as it is tried (4.6): only the agent can write one, however it is asked.
	const onTry = (key: string, value: TriedValue | null) => {
		setTried((was) => {
			const next = new Map(was);
			if (value === null) next.delete(key);
			else next.set(key, value);
			return next;
		});
		if (value?.follows !== undefined) onWrite(value);
	};
	const component = ready?.components.find((c) => c.id === id);
	if (note) return <TabNote note={note.says} onRetry={note.onRetry} />;
	if (!ready || !component) return <TabNote note="The design system shown no longer has this component. Close this tab." />;
	const actions: TokenActions = {
		onEdit: setEditing,
		onSource: ({ file, line }) => vscode().postMessage({ type: 'open-library-source', file, line }),
	};
	// What its Changes button counts: the values tried on it and the token changes being tried, which move its stories too.
	const count = tried.size + edits.length;
	const link = (to: ComponentLink) => vscode().postMessage({ type: 'component-link', id, link: to });
	const open = (other: string) => vscode().postMessage({ type: 'open-component', id: other });
	return (
		<ModeProvider value={mode}>
			<TokenChangesProvider value={changes}>
				<main className="tab tab-split">
					<header className="tab-header">
						<div className="tab-heading">
							<h1 className="tab-title">{component.name}</h1>
							<p className="quiet">{component.subtitle ?? component.group}</p>
						</div>
						<div className="tab-actions">
							{/* Always there, so nothing moves when the first value is tried; with nothing tried and no branch, it cannot be pressed. */}
							<Button variant="secondary" disabled={count === 0 && !kept} onClick={() => setChangesOpen(true)}>
								{count === 0 ? 'No changes' : plural(count, 'change')}
							</Button>
							<Button variant="secondary" onClick={() => setAsking(true)}>
								Ask…
							</Button>
							{component.storybook !== null && (
								<Button variant="secondary" external onClick={() => link('storybook')}>
									Storybook
								</Button>
							)}
							<Button variant="secondary" external onClick={() => link('source')}>
								GitHub
							</Button>
						</div>
					</header>
					<div className="component-layout">
						<div className="component-stories">
							<Stories component={component} commit={ready.commit} edits={edits} tried={[...tried.values()]} />
						</div>
						<aside className="component-aside">
							<ComponentSections
								component={component}
								components={ready.components}
								actions={actions}
								trying={{ tried, onTry, onAll, onWrite, writes, writeError }}
								onOpen={open}
								changes={{ open: changesOpen, onClose: () => setChangesOpen(false), onKept: setKept }}
							/>
						</aside>
					</div>
				</main>
				{editing && <TokenEditor key={editing.path} token={editing} onClose={() => setEditing(null)} />}
				{asking && (
					<AskInWords
						file={id}
						about={`Its tokens and ${component.name}'s own values: what its controls change.`}
						edits={edits}
						tried={[...tried.values()]}
						onAsked={(asked) => {
							changes.changeAll(asked.edits);
							for (const t of asked.values) onTry(triedId(t), t);
						}}
						onClose={() => setAsking(false)}
					/>
				)}
			</TokenChangesProvider>
		</ModeProvider>
	);
};
