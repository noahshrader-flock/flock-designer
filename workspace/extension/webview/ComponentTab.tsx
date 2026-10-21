import { useState } from 'react';
import { previewAddress, previewProblem } from '../../src/shared/catalog';
import type { CatalogComponent, DesignToken, TokenEdit, TriedValue } from '../../src/shared/contract';
import { undeclared } from '../../src/shared/wcag';
import { TokenChangesProvider, useTokenChangesFor } from './hooks/tokenChanges';
import { useStoryPreview } from './hooks/useStoryPreview';
import type { ComponentLink } from '../src/messages';
import { ChangesLink } from './ChangesLink';
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

const NOT_READ = undeclared('the design system is not read yet');

const Stories = ({ component, commit, edits, tried }: { component: CatalogComponent; commit: string; edits: TokenEdit[]; tried: TriedValue[] }) => {
	const { preview, trying, refused, retry } = useStoryPreview(commit, edits);
	// The panel's chosen mode, as the values use; a frame follows a change of it by loading again.
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

/** The token change being tried is the extension's, so a change made in the panel is seen here. */
export const ComponentTab = ({ id }: { id: string }) => {
	const { ready, note } = useTabCatalog();
	const [edits, setEdits] = useTokenEdits();
	const [editing, setEditing] = useState<DesignToken | null>(null);
	const changes = useTokenChangesFor(ready?.tokens.tokens ?? [], edits, setEdits, ready?.accessibility ?? NOT_READ);
	// The extension's, so the panel's Changes has them too; on the commit tried on, since another version's instances are drawn anew.
	const trying = useTrying(useValueTrials(), id, ready?.commit ?? null);
	const { tried } = trying;
	const component = ready?.components.find((c) => c.id === id);
	if (note) return <TabNote {...note} />;
	if (!component) return <Message size="page">The design system shown no longer has this component. Close this tab.</Message>;
	const actions: TokenActions = { onEdit: setEditing };
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
						<ChangesLink file={id} count={tried.size + edits.length} trying={trying} />
						{component.storybookPath !== null && (
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
						/>
					</aside>
				</div>
			</main>
			{editing && <TokenEditor key={editing.path} token={editing} components={ready.components} onClose={() => setEditing(null)} />}
		</TokenChangesProvider>
	);
};
