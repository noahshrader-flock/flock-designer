import { useState } from 'react';
import type { Context } from '../../src/main/services/findContext';
import type { Catalog, ComponentPictures, DesignToken, TokenEdit } from '../../src/shared/contract';
import { plural } from '../../src/shared/plural';
import { HOST } from '../../src/shared/vocabulary';
import { TokenChangesProvider, useTokenChangesFor } from '../../src/renderer/tokenChanges';
import { useTokenBranch } from '../../src/renderer/useTokenBranch';
import { Changed } from './Changed';
import { TokenEditor } from './TokenEditor';
import type { ComponentLink } from '../src/messages';
import { ComponentsView } from './Components';
import { TokensView } from './Tokens';
import type { CatalogRead } from './useCatalog';
import { Button } from './ui/Button';
import { Dialog } from './ui/Dialog';
import { EmptyState } from './ui/EmptyState';
import { Icon } from './ui/Icon';
import { IconButton } from './ui/IconButton';
import { Menu } from './ui/Menu';
import { Toggle } from './ui/Toggle';
import type { Part, View } from './vscode';

/** The design system's two parts in the panel: its components, which it starts on, and its tokens. */
const PARTS = [
	{ value: 'components', label: 'Components', icon: 'extensions' },
	{ value: 'tokens', label: 'Tokens', icon: 'symbol-color' },
] as const satisfies { value: Part; label: string; icon: string }[];

/** What the Design System tab does when pressed: what the panel asks the core, or the extension. */
export interface DesignSystemDoes {
	sync: () => void;
	locate: () => void;
	openComponent: (id: string) => void;
	componentLink: (id: string, link: ComponentLink) => void;
	openPrimitives: () => void;
	openVoiceAndTone: () => void;
	openTokenSource: (source: DesignToken['source']) => void;
	setEdits: (edits: TokenEdit[]) => void;
}

/** A folder's own name, from its path. */
const folderName = (path: string): string => path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;

/** What the library has that is not read, said where it can be read: each with its file and line. */
const Problems = ({ problems, onClose }: { problems: Extract<Catalog, { state: 'ready' }>['tokens']['problems']; onClose: () => void }) => (
	<Dialog title="Not read" onClose={onClose}>
		<p className="dialog-about">These values in its token files are not read, so they are not shown or changed here. The rest are.</p>
		<ul className="problem-list">
			{problems.map((p) => (
				<li key={`${p.file}:${p.line ?? ''}:${p.reason}`}>
					<code>
						{p.file}
						{p.line !== undefined && `:${p.line}`}
					</code>{' '}
					{p.reason}
				</li>
			))}
		</ul>
		<div className="dialog-buttons">
			<Button onClick={onClose}>Close</Button>
		</div>
	</Dialog>
);

/**
 * The design system, read (6.1): its name and branch, Sync and its menu (Primitives, the voice and tone), what is wrong with it if anything (an
 * update that failed, values not read), what has been changed and its branch, then Components or Tokens. The change to
 * the tokens being tried is the extension's (`edits`), so its tabs see it too; every token row here shows the tokens as
 * changed, and a token that can be changed opens its control when pressed (6.2).
 */
const Ready = ({
	catalog,
	id,
	name,
	syncing,
	pictures,
	part,
	onPart,
	view,
	onView,
	edits,
	does,
}: {
	catalog: Extract<Catalog, { state: 'ready' }>;
	id: string | null;
	name: string;
	syncing: boolean;
	pictures: ComponentPictures;
	part: Part;
	onPart: (part: Part) => void;
	view: View;
	onView: (view: View) => void;
	edits: TokenEdit[];
	does: DesignSystemDoes;
}) => {
	const changes = useTokenChangesFor(catalog.tokens.tokens, edits, does.setEdits, catalog.accessibility);
	// Where the change is kept once saved, and proposed (T4, T5): a change DSNR was closed with comes back in the panel.
	const branch = useTokenBranch(id, edits, does.setEdits);
	const [problems, setProblems] = useState(false);
	// The token whose control is open, by its path: the row pressed.
	const [editing, setEditing] = useState<DesignToken | null>(null);
	const notRead = catalog.tokens.problems.length;
	return (
		<TokenChangesProvider value={changes}>
			<div className="ds-header">
				<span className="ds-title">
					<span data-part="name" className="ds-name">
						{name}
					</span>
					<span data-part="branch" className="ds-branch" title={`Read from ${catalog.branch} on ${HOST}`}>
						<Icon name="git-branch" />
						{catalog.branch}
					</span>
				</span>
				<span className="ds-actions">
					<IconButton icon={syncing ? 'sync' : 'refresh'} label={syncing ? 'Syncing…' : `Sync with ${HOST}`} disabled={syncing} onClick={does.sync} />
					<Menu
						label="Design system actions"
						items={[
							{ label: 'Open Primitives', icon: 'symbol-ruler', onSelect: does.openPrimitives },
							{ label: 'Open Voice and Tone', icon: 'quote', onSelect: does.openVoiceAndTone },
						]}
					/>
				</span>
			</div>
			{typeof catalog.update === 'object' && (
				<p data-update-failed className="note note-warning">
					<Icon name="warning" /> Could not update from {HOST}: {catalog.update.failed} It is shown as this computer last had it.
				</p>
			)}
			{notRead > 0 && (
				<p className="note">
					<button type="button" className="link" onClick={() => setProblems(true)}>
						{plural(notRead, 'value')} in its token files {notRead === 1 ? 'is' : 'are'} not read
					</button>
				</p>
			)}
			<Changed controls={branch} />
			<div className="ds-part">
				<Toggle label="Part" options={PARTS} value={part} onChange={onPart} />
			</div>
			{part === 'components' ? (
				catalog.components.length === 0 ? (
					<p className="note">Its Storybook has no stories on {catalog.branch}, so there are no components to list.</p>
				) : (
					<ComponentsView
						components={catalog.components}
						pictures={pictures}
						view={view}
						onView={onView}
						onOpen={does.openComponent}
						onLink={does.componentLink}
					/>
				)
			) : (
				<TokensView tokens={catalog.tokens} onEdit={setEditing} onSource={does.openTokenSource} />
			)}
			{editing && <TokenEditor token={editing} onClose={() => setEditing(null)} />}
			{problems && <Problems problems={catalog.tokens.problems} onClose={() => setProblems(false)} />}
		</TokenChangesProvider>
	);
};

/**
 * The Design System tab (ELECTRON_MIGRATION_PLAN 6.1): the design system found (§1.6), read as the app reads the one
 * connected, from its branch on GitHub as its clone has it. With none found, what DSNR looked for and where, and Locate
 * design system; found but not readable, why; while it is read, a line saying so; then the design system itself.
 */
export const DesignSystem = ({
	found,
	unreadable,
	read,
	pictures,
	part,
	onPart,
	view,
	onView,
	edits,
	does,
}: {
	found: Context['designSystem'];
	unreadable: string | null;
	read: CatalogRead;
	pictures: ComponentPictures;
	part: Part;
	onPart: (part: Part) => void;
	view: View;
	onView: (view: View) => void;
	edits: TokenEdit[];
	does: DesignSystemDoes;
}) => {
	if (!found)
		return (
			<EmptyState icon="symbol-color" title="No design system found">
				<p>
					DSNR looks in the folders open in this window for a design system: the one the product names in its <code>.dsnr/workspace.json</code>, or
					any folder with stories or tokens.
				</p>
				<Button onClick={does.locate}>Locate design system…</Button>
			</EmptyState>
		);
	if (unreadable !== null)
		return (
			<EmptyState icon="warning" title="The design system cannot be read">
				<p>{unreadable}</p>
				<Button onClick={does.locate}>Locate design system…</Button>
			</EmptyState>
		);
	const { catalog, error } = read;
	if (catalog === null && error !== null)
		return (
			<EmptyState icon="warning" title="The design system could not be read">
				<p>{error}</p>
				<Button onClick={does.sync}>Try again</Button>
			</EmptyState>
		);
	if (catalog === null || catalog.state === 'none') return <p className="note">Reading the design system…</p>;
	if (catalog.state === 'lost')
		return (
			<EmptyState icon="warning" title={`${catalog.name} is no longer on this computer`}>
				<p>Its copy was at {catalog.root}. Open its folder again, or locate it.</p>
				<Button onClick={does.locate}>Locate design system…</Button>
			</EmptyState>
		);
	if (catalog.state === 'no-branch')
		return (
			<EmptyState icon="warning" title={`This clone has no ${catalog.branch} branch`}>
				<p>
					The clone at {catalog.root} has no {catalog.branch} branch from {HOST} to read, and no other branch is read in its place. Check it is a
					clone of the design system, and that this computer can reach {HOST}.
				</p>
				<Button onClick={does.sync}>Try again</Button>
			</EmptyState>
		);
	return (
		<Ready
			catalog={catalog}
			id={read.id}
			name={read.name ?? folderName(found.root)}
			syncing={read.syncing}
			pictures={pictures}
			part={part}
			onPart={onPart}
			view={view}
			onView={onView}
			edits={edits}
			does={does}
		/>
	);
};
