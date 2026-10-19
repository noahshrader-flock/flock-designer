import { useState } from 'react';
import { previewAddress, previewProblem } from '../../src/shared/catalog';
import type { CatalogComponent, DesignToken, TokenEdit, TriedValue } from '../../src/shared/contract';
import { plural } from '../../src/shared/plural';
import { undeclared } from '../../src/shared/wcag';
import { TokenChangesProvider, useTokenChangesFor } from './hooks/tokenChanges';
import { useStoryPreview } from './hooks/useStoryPreview';
import type { ComponentLink } from '../src/messages';
import { ComponentSections } from './ComponentSections';
import { StoryFrame } from './StoryFrame';
import { TokenEditor } from './TokenEditor';
import type { TokenActions } from './Tokens';
import { ShowingNote } from './Showing';
import { useTabCatalog } from './useCatalog';
import { useTrying } from './useTrying';
import { Button, ButtonRow } from '../../src/ui/Button';
import { asks } from './host';
import { useMode, useTokenEdits, useValueTrials } from './shared';
import { Message, tryAgain } from '../../src/ui/Message';
import { Heading } from '../../src/ui/Heading';
import { TabNote } from './TabNote';

/** The target while the design system is not read yet: nothing is judged at it then. */
const NOT_READ = undeclared('the design system is not read yet');

/**
 * Its stories, live (`useStoryPreview`): with the change to the tokens being tried, the stories shown stay while it builds,
 * said over them, and a change that cannot be tried says why.
 */
const Stories = ({ component, commit, edits, tried }: { component: CatalogComponent; commit: string; edits: TokenEdit[]; tried: TriedValue[] }) => {
	const { preview, trying, refused, retry } = useStoryPreview(commit, edits);
	// The stories are drawn in the mode chosen in the panel, as the values are; a frame follows it by loading again.
	const [mode] = useMode();
	if (preview.state === 'building') return <Message>Building its previews…</Message>;
	if (preview.state !== 'ready')
		return (
			<Message size="block" tone="warning" title="Its previews could not be built" action={tryAgain(retry)}>
				{previewProblem(preview)}
			</Message>
		);
	return (
		<>
			{refused && (
				<Message size="block" tone="warning" title="This change could not be tried">
					{refused}
				</Message>
			)}
			<div className="stories" aria-busy={trying}>
				<StoryFrame src={previewAddress(preview.base, component.id, mode)} title={component.name} tried={tried} />
				{trying && <p className="stories-building">Building…</p>}
			</div>
		</>
	);
};

/**
 * A component's tab: its name and line, its links (Storybook when a hosted one is known, and its source), its stories live,
 * and beside them what its analysis says (`ComponentSections`). The change to the tokens being tried is the extension's, so
 * a change made in the panel is seen here.
 */
export const ComponentTab = ({ id }: { id: string }) => {
	const { ready, note } = useTabCatalog();
	const [edits, setEdits] = useTokenEdits();
	// The token whose control is open: the Tokens' rows, and a value that is a token's, change it as the panel's do, and every
	// page sees it.
	const [editing, setEditing] = useState<DesignToken | null>(null);
	// Its Changes dialog: what is tried on it and the token changes, from the button in its header.
	const [changesOpen, setChangesOpen] = useState(false);
	// Whether a branch of its values is kept: then the button can be pressed with nothing tried, to propose or leave it.
	const [kept, setKept] = useState(false);
	const changes = useTokenChangesFor(ready?.tokens.tokens ?? [], edits, setEdits, ready?.accessibility ?? NOT_READ);
	// The values tried on its instances: the extension's, so the panel's Changes has them too, on the library's commit
	// they were tried on (another version's instances are drawn anew), and forgotten when another mode is chosen.
	const trying = useTrying(useValueTrials(), id, ready?.commit ?? null);
	const { tried } = trying;
	const component = ready?.components.find((c) => c.id === id);
	if (note) return <TabNote {...note} />;
	if (!component) return <Message size="page">The design system shown no longer has this component. Close this tab.</Message>;
	const actions: TokenActions = { onEdit: setEditing };
	// What its Changes button counts: the values tried on it and the token changes being tried, which move its stories too.
	const count = tried.size + edits.length;
	const link = (to: ComponentLink) => void asks().componentLink(id, to);
	return (
		<TokenChangesProvider value={changes}>
			<main className="tab tab-split">
				<header className="tab-header">
					<div className="tab-heading">
						<Heading size="page">{component.name}</Heading>
						<Message>{component.subtitle ?? component.group}</Message>
					</div>
					<ButtonRow>
						{/* Always there, so nothing moves when the first value is tried; with nothing tried and no branch, it cannot be pressed. */}
						<Button variant="ghost" disabled={count === 0 && !kept} onPress={() => setChangesOpen(true)}>
							{count === 0 ? 'No changes' : plural(count, 'change')}
						</Button>
						{component.storybook !== null && (
							<Button variant="secondary" external onPress={() => link('storybook')}>
								Storybook
							</Button>
						)}
						<Button variant="secondary" external onPress={() => link('source')}>
							GitHub
						</Button>
					</ButtonRow>
				</header>
				<ShowingNote showing={ready.showing} branch={ready.branch} />
				<div className="component-layout">
					<div className="component-stories">
						<Stories component={component} commit={ready.commit} edits={edits} tried={[...tried.values()]} />
					</div>
					<aside className="component-aside">
						<ComponentSections
							// Asked again on another commit shown (Preview this branch): what it says is that commit's.
							key={ready.commit}
							component={component}
							components={ready.components}
							actions={actions}
							trying={trying}
							changes={{
								open: changesOpen,
								onClose: () => setChangesOpen(false),
								onKept: setKept,
								onActions: () => void asks().openChanges(),
							}}
						/>
					</aside>
				</div>
			</main>
			{editing && <TokenEditor key={editing.path} token={editing} components={ready.components} onClose={() => setEditing(null)} />}
		</TokenChangesProvider>
	);
};
