import { useEffect, useState } from 'react';
import { baseName } from '../../src/shared/baseName';
import type { Context } from '../../src/core/services/projects/findContext';
import type { Catalog, ComponentPictures, DesignToken } from '../../src/shared/contract';
import { plural } from '../../src/shared/plural';
import { isDark } from '../../src/shared/tokens';
import { HOST } from '../../src/shared/vocabulary';
import { TokenChangesProvider, useTokenChangesFor } from './hooks/tokenChanges';
import { useChangeBranch } from './hooks/useChangeBranch';
import { Changed } from './Changed';
import { DesignSystemHeader } from './DesignSystemHeader';
import { ComponentChanges } from './ComponentChanges';
import { CodeChanges, editedCount } from './CodeChanges';
import { useEditedInCode } from './hooks/useEditedInCode';
import { ShowingContext, ShowingNote } from './Showing';
import { useTokenEdits, useValueTrials } from './shared';
import { triedOn } from './valueTrials';
import { TokenEditor } from './TokenEditor';
import { ComponentsView } from './Components';
import { TokensView } from './Tokens';
import { syncDesignSystem, useCatalog } from './useCatalog';
import { Badge } from '../../src/ui/Badge';
import { LinkButton } from '../../src/ui/LinkButton';
import { Dialog } from '../../src/ui/Dialog';
import { Menu } from '../../src/ui/Menu';
import { Toggle } from '../../src/ui/Toggle';
import type { View } from '../../src/ui/Collection';
import type { Part } from './vscode';
import { asks, workspace } from './host';
import { Spinner } from '../../src/ui/Spinner';
import { Message, tryAgain } from '../../src/ui/Message';
import { askOnce } from './hooks/ask';

const PARTS = [
	{ value: 'components', label: 'Components' },
	{ value: 'tokens', label: 'Tokens' },
] as const satisfies { value: Part; label: string }[];

/** The panel's, so a component's tab can ask for it. */
interface ChangesDialog {
	open: boolean;
	onOpen: () => void;
	onClose: () => void;
}

const CHOOSE = 'Choose design system…';
const choose = () => void asks().chooseDesignSystem();

const Problems = ({ problems, onClose }: { problems: Extract<Catalog, { state: 'ready' }>['tokens']['problems']; onClose: () => void }) => (
	<Dialog title="Not read" onClose={onClose}>
		<Message>These values in its token files are not read, so they are not shown or changed here. The rest are.</Message>
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
	</Dialog>
);

/** The token change being tried is the extension's (`edits`), so its tabs see it too. */
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
	changesDialog,
	canChoose,
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
	changesDialog: ChangesDialog;
	/** A product is open, so a design system can be chosen for it. */
	canChoose: boolean;
}) => {
	const [edits, setEdits] = useTokenEdits();
	const changes = useTokenChangesFor(catalog.tokens.tokens, edits, setEdits, catalog.accessibility);
	const branch = useChangeBranch('tokens', { shown: id, scope: null, change: edits, setChange: setEdits });
	const [problems, setProblems] = useState(false);
	const [editing, setEditing] = useState<DesignToken | null>(null);
	// In a dialog from their count, so nothing opens above the list.
	const { trials, change: tryValues } = useValueTrials();
	const [keptFiles, setKeptFiles] = useState<string[]>([]);
	// What is kept is asked again whenever what is being tried starts or ends (a branch kept ends a trial), as the count
	// shows it, and when the dialog opens; not at every value moved.
	const tried = [edits.length > 0, ...Object.keys(trials).sort()].join('\n');
	useEffect(
		() =>
			askOnce(
				() => Promise.all([workspace().changeScopes('values'), workspace().changeScopes('handOver')]),
				([saved, handed]) => setKeptFiles([...(saved.ok ? saved.value : []), ...(handed.ok ? handed.value : [])]),
			),
		[changesDialog.open, catalog.commit, tried],
	);
	const triedOnIt = (file: string) => triedOn(trials, file, catalog.commit);
	const changed = catalog.components.filter((c) => triedOnIt(c.id).length > 0 || keptFiles.includes(c.id));
	// What the dialog lists, counted: each value tried, and the tokens (`''`) or a component with a branch kept or handed
	// over and nothing tried, once.
	const beingTried = (edits.length || (keptFiles.includes('') ? 1 : 0)) + changed.reduce((n, c) => n + Math.max(triedOnIt(c.id).length, 1), 0);
	// Two or more to undo is one to undo them all: the tokens, and each component with values tried.
	const resettable = changed.filter((c) => triedOnIt(c.id).length > 0);
	const resetsAll = (edits.length > 0 ? 1 : 0) + resettable.length >= 2;
	const resetAll = () => {
		setEdits([]);
		for (const c of resettable) tryValues(c.id, catalog.commit, () => []);
	};
	const edited = useEditedInCode(catalog.commit);
	const inCode = editedCount(edited);
	const count = beingTried + inCode;
	const said =
		[beingTried > 0 && `${plural(beingTried, 'change')} being tried`, inCode > 0 && `${inCode} edited in your code`].filter(Boolean).join(', ') ||
		'No changes yet';
	const notRead = catalog.tokens.problems.length;
	const hasDark = catalog.tokens.tokens.some(isDark);
	return (
		<TokenChangesProvider value={changes}>
			<ShowingContext.Provider value={catalog.showing}>
				<DesignSystemHeader name={name} branch={catalog.branch}>
					{/* Always there, gray at none and brand from one, so the changes can be opened before there are any. */}
					<Badge tone={count > 0 ? 'brand' : 'neutral'} count={count} label={said} onPress={changesDialog.onOpen} />
					{notRead > 0 && (
						<Badge
							tone="warning"
							count={notRead}
							label={`${plural(notRead, 'value')} in its token files ${notRead === 1 ? 'is' : 'are'} not read`}
							onPress={() => setProblems(true)}
						/>
					)}
					<Menu
						label="Design system actions"
						size="small"
						always
						sections={[
							{
								items: [
									{
										label: syncing ? 'Syncing…' : `Sync with ${HOST}`,
										icon: syncing ? <Spinner /> : 'refresh',
										disabled: syncing,
										onSelect: syncDesignSystem,
									},
								],
							},
							{
								items: [
									{ label: 'Primitives', icon: 'symbol-ruler', onSelect: () => void asks().openPrimitives() },
									{ label: 'Voice and Tone', icon: 'quote', onSelect: () => void asks().openVoiceAndTone() },
								],
							},
							...(canChoose ? [{ items: [{ label: CHOOSE, icon: 'folder-opened', onSelect: choose }] }] : []),
						]}
					/>
				</DesignSystemHeader>
				<ShowingNote showing={catalog.showing} branch={catalog.branch} />
				{typeof catalog.update === 'object' && (
					<Message tone="warning" inset marks={{ 'data-update-failed': '' }}>
						Could not update from {HOST}: {catalog.update.failed} It is shown as this computer last had it.
					</Message>
				)}
				<div className="ds-part">
					<Toggle label="Part" options={PARTS} value={part} onChange={onPart} />
				</div>
				{part === 'components' ? (
					catalog.components.length === 0 ? (
						<Message inset>Its Storybook has no stories on {catalog.branch}, so there are no components to list.</Message>
					) : (
						<ComponentsView components={catalog.components} pictures={pictures} view={view} onView={onView} hasDark={hasDark} />
					)
				) : (
					<TokensView tokens={catalog.tokens} onEdit={setEditing} />
				)}
				{editing && <TokenEditor key={editing.path} token={editing} components={catalog.components} onClose={() => setEditing(null)} />}
				{problems && <Problems problems={catalog.tokens.problems} onClose={() => setProblems(false)} />}
				{changesDialog.open && (
					<Dialog title="Changes" onClose={changesDialog.onClose} actions={resetsAll && <LinkButton onPress={resetAll}>Reset all</LinkButton>}>
						{count === 0 && (
							<Message size="box" icon="symbol-color" title="No changes yet">
								<p>Changes you try, or edit in your code, are listed here.</p>
							</Message>
						)}
						<Changed id={id} controls={branch} components={catalog.components} />
						{changed.map((c) => (
							<ComponentChanges
								// Asked again on another commit shown: its values are read on that commit's drawing.
								key={`${c.id}\u0000${catalog.commit}`}
								component={c}
								components={catalog.components}
								commit={catalog.commit}
							/>
						))}
						{edited.state === 'ready' && <CodeChanges edited={edited} branch={catalog.branch} components={catalog.components} />}
					</Dialog>
				)}
			</ShowingContext.Provider>
		</TokenChangesProvider>
	);
};

export const DesignSystem = ({
	context,
	unreadable,
	pictures,
	part,
	onPart,
	view,
	onView,
	changesDialog,
}: {
	context: Pick<Context, 'designSystem' | 'product' | 'source'>;
	unreadable: string | null;
	pictures: ComponentPictures;
	part: Part;
	onPart: (part: Part) => void;
	view: View;
	onView: (view: View) => void;
	changesDialog: ChangesDialog;
}) => {
	const read = useCatalog();
	const found = context.designSystem;
	// Choosing needs a product to keep the choice for; with none open, what is open is shown.
	const action = context.product === null ? undefined : { label: CHOOSE, onPress: choose };
	if (!found)
		return (
			<Message size="page" icon="symbol-color" title="No design system found" action={action}>
				{context.source?.state === 'refused' ? (
					<p>{context.source.why}</p>
				) : context.product === null ? (
					<p>Open a product to choose a design system.</p>
				) : (
					<p>
						DSNR looks in the folders open in this window for a design system: the one the product names in its <code>.dsnr/workspace.json</code>, or
						any folder with stories or tokens.
					</p>
				)}
			</Message>
		);
	if (unreadable !== null)
		return (
			<Message size="page" icon="warning" title="The design system cannot be read" action={action}>
				<p>{unreadable}</p>
			</Message>
		);
	const { catalog, error } = read;
	if (catalog === null && error !== null)
		return (
			<Message size="page" icon="warning" title="The design system could not be read" action={tryAgain(syncDesignSystem)}>
				<p>{error}</p>
			</Message>
		);
	if (catalog === null || catalog.state === 'none')
		return (
			<Message size="page" waiting>
				Reading the design system…
			</Message>
		);
	if (catalog.state === 'lost')
		return (
			<Message size="page" icon="warning" title={`${catalog.name} is no longer on this computer`} action={action}>
				<p>
					Its copy was at {catalog.root}. Open its folder again{action ? ', or choose another' : ''}.
				</p>
			</Message>
		);
	if (catalog.state === 'no-branch')
		return (
			<Message size="page" icon="warning" title={`This clone has no ${catalog.branch} branch`} action={tryAgain(syncDesignSystem)}>
				<p>
					The clone at {catalog.root} has no {catalog.branch} branch from {HOST} to read, and no other branch is read in its place. Check it is a
					clone of the design system, and that this computer can reach {HOST}.
				</p>
			</Message>
		);
	return (
		<Ready
			catalog={catalog}
			id={read.id}
			name={read.name ?? baseName(found.root)}
			syncing={read.syncing}
			pictures={pictures}
			part={part}
			onPart={onPart}
			view={view}
			onView={onView}
			changesDialog={changesDialog}
			canChoose={context.product !== null}
		/>
	);
};
