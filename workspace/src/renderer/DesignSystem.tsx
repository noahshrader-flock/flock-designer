import { ChevronDownIcon, GitBranchIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { useCallback, useState } from 'react';
import type { Catalog, CatalogComponent, CatalogUpdate, ConnectedDesignSystem } from '../shared/contract';
import { ComponentPage } from './ComponentPage';
import { ComponentPanel } from './ComponentPanel';
import { ConnectDesignSystem } from './ConnectDesignSystem';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { useClosedGroups } from './GroupAccordion';
import { MoreMenu } from './MoreMenu';
import { Page } from './Page';
import { Primitives } from './Primitives';
import { TOKENS_PANEL } from './panelWidth';
import { ResizablePanel } from './ResizablePanel';
import { SearchField } from './SearchField';
import { CardGridSkeleton, RowsSkeleton, SkeletonStatus } from './Skeletons';
import { SyncButton } from './SyncButton';
import { ProblemList, ProblemsDialog } from './ProblemsDialog';
import { TokenProblems } from './TokenProblems';
import { TokensPanel } from './TokensPanel';
import { useComponentPictures } from './useComponentPictures';
import { type DesignSystemState, useDesignSystem } from './useDesignSystem';
import { useTokenBranch } from './useTokenBranch';
import { TokenChangesProvider, useTokenChangesFor } from './tokenChanges';
import { Skeleton } from './ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group';
import { ViewSwitcher, useRememberedView } from './ViewSwitcher';
import { Toolbar, ToolbarEnd } from './Toolbar';
import { VoiceAndTone } from './VoiceAndTone';
import { Button } from './ui/button';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { HOST } from '../shared/vocabulary';
import { ErrorAlert } from './ErrorAlert';
import { Notice, RetryButton } from './Notice';
import { InlineAction } from './Links';
import { LocationHint } from './LocationHint';
import { ComponentList } from './ComponentList';
import { PageHeading } from './PageHeading';

/** Said only when the update failed, as the other problems are (`ProblemsDialog`): the list shown is what this computer had, not an error. */
const UpdateProblem = ({ update }: { update: CatalogUpdate }) =>
	typeof update === 'object' ? (
		<ProblemsDialog label={`Could not update from ${HOST}`} description="The library is shown as this computer last had it.">
			<ProblemList items={[{ detail: update.failed }]} />
		</ProblemsDialog>
	) : null;

/**
 * Which design system is shown (P4): its name (its Storybook's brand, else its package's or repository's), the
 * repository under it in the menu, every one connected to switch to, and a way to connect another.
 */
const DesignSystemSwitcher = ({
	systems,
	shown,
	onSelect,
	onAdd,
}: {
	systems: ConnectedDesignSystem[];
	shown: ConnectedDesignSystem | null;
	onSelect: (id: string) => void;
	onAdd: () => void;
}) => (
	<DropdownMenu>
		<DropdownMenuTrigger asChild>
			<Button variant="ghost" className="-ml-2.5 font-semibold" aria-label={`Design system ${shown?.name ?? ''}: switch design system`}>
				{shown?.name ?? 'Design system'}
				<ChevronDownIcon />
			</Button>
		</DropdownMenuTrigger>
		<DropdownMenuContent align="start" className="w-auto min-w-64">
			<DropdownMenuRadioGroup value={shown?.id ?? ''} onValueChange={(id) => id !== shown?.id && onSelect(id)}>
				{systems.map((s) => (
					<DropdownMenuRadioItem key={s.id} value={s.id}>
						<span className="flex flex-col gap-0.5">
							<span>{s.name}</span>
							<span className="text-muted-foreground text-xs">
								{s.repository}
								{s.folder !== '' && ` · ${s.folder}`}
							</span>
						</span>
					</DropdownMenuRadioItem>
				))}
			</DropdownMenuRadioGroup>
			<DropdownMenuSeparator />
			<DropdownMenuItem onSelect={onAdd}>
				<PlusIcon />
				Connect a design system
			</DropdownMenuItem>
		</DropdownMenuContent>
	</DropdownMenu>
);

type PanelView = 'tokens' | 'component';

/** The components as a list of rows, or a grid of cards with pictures (P5): chosen with the switch, remembered. */
const VIEW_KEY = 'dsnr.componentsView';

/**
 * Which the side panel shows, as a button group like a prototype's states, across the panel's width: the component that is
 * open, or the tokens. Component is first, and off while none is open, as there is nothing to show; the tokens are what the
 * panel shows until then.
 */
const PanelSwitcher = ({ view, canShowComponent, onSelect }: { view: PanelView; canShowComponent: boolean; onSelect: (view: PanelView) => void }) => (
	<ToggleGroup
		type="single"
		variant="outline"
		spacing={0}
		fullWidth
		aria-label="Side panel"
		value={view}
		// Pressing the one shown would unpress it, leaving none shown: it stays.
		onValueChange={(next) => (next === 'tokens' || next === 'component') && next !== view && onSelect(next)}
	>
		<ToggleGroupItem value="component" disabled={!canShowComponent}>
			Component
		</ToggleGroupItem>
		<ToggleGroupItem value="tokens">Tokens</ToggleGroupItem>
	</ToggleGroup>
);

/** The Design System tab's own tabs (T9): the company's design system, as its components, its primitives, and its voice and tone. */
type Tab = 'components' | 'primitives' | 'voice-and-tone';

/**
 * The Design System tab (DESIGN_SYSTEM_PLAN.md): the company's, not any one library's. Under the top bar, **its first row
 * is the design system itself**, whichever view is shown: its name (to switch to another connected, or connect one), its
 * branch, what is wrong with it, Sync and More. Under that, at the left, the views as the app's line tabs (`Tabs
 * variant="line"`, T9), Components, Primitives and Voice and Tone, and each view under the tab strip, scrolling on its own;
 * at the right, beside them, the side panel, which is the Components view's alone. Each view stays mounted while another
 * is shown, as the panel does, so what was typed, scrolled and opened in them is as it was left.
 *
 * What is read and done to the design system is `useDesignSystem`'s, so the row, the views and the panel all see the
 * same one: Primitives draws the tokens Components read, and nothing is read twice. Opening a component switches the panel
 * to it, leaving it switches back to the tokens, and either can be chosen while it is open; the tokens are only hidden
 * meanwhile, so their search, tab and open groups are as they were left. The change being tried is the screen's: the panel
 * makes it, an open component's previews are built with it, and a design system shown afresh starts with none. Not a
 * second Storybook: docs and controls stay there, behind each component's links.
 */
export const DesignSystem = ({ hidden }: { hidden: boolean }) => {
	const [tab, setTab] = useState<Tab>('components');
	// The component open on its own page, by id; the list when there is none. And what the side panel shows: opening or
	// leaving a component sets both, so the panel follows without anything watching for it.
	const [open, setOpen] = useState<string | null>(null);
	const [view, setView] = useState<PanelView>('tokens');
	const openComponent = useCallback((id: string | null) => {
		setOpen(id);
		setView(id === null ? 'tokens' : 'component');
	}, []);
	const ds = useDesignSystem(
		hidden,
		useCallback(() => openComponent(null), [openComponent]),
	);
	const { catalog, edits } = ds;
	const ready = catalog?.state === 'ready' ? catalog : null;
	// A component a sync removed is closed rather than shown from a list that no longer has it.
	const opened = ready && open !== null ? ready.components.find((c) => c.id === open) : undefined;
	return (
		<div className="flex h-(--content-height) flex-col">
			<DesignSystemRow ds={ds} />
			<div className="flex min-h-0 flex-1">
				<Tabs variant="line" value={tab} onValueChange={(next) => setTab(next as Tab)} className="min-w-0">
					<TabsList aria-label="Design System">
						<TabsTrigger value="components">Components</TabsTrigger>
						<TabsTrigger value="primitives">Primitives</TabsTrigger>
						<TabsTrigger value="voice-and-tone">Voice and Tone</TabsTrigger>
					</TabsList>
					{/* No padding: each view has its own layout. Kept while another is shown, only hidden. */}
					<TabsContent value="components" forceMount hidden={tab !== 'components'} data-tab="components" className="p-0">
						{/* Another design system is a fresh list: its search and closed groups start over. */}
						<Components key={ds.generation} hidden={hidden || tab !== 'components'} ds={ds} opened={opened} onOpen={openComponent} />
					</TabsContent>
					<TabsContent value="primitives" forceMount hidden={tab !== 'primitives'} data-tab="primitives" className="p-0">
						<Primitives catalog={catalog} edits={edits} hidden={hidden || tab !== 'primitives'} />
					</TabsContent>
					<TabsContent value="voice-and-tone" forceMount hidden={tab !== 'voice-and-tone'} data-tab="voice-and-tone" className="p-0">
						<VoiceAndTone hidden={hidden || tab !== 'voice-and-tone'} />
					</TabsContent>
				</Tabs>
				{/* The Components view's, and hidden, not left, on the others: its search, tab and open groups are as they were. */}
				{ready && (
					<div hidden={tab !== 'components'} className={tab === 'components' ? 'flex min-h-0' : undefined}>
						<SidePanel ds={ds} catalog={ready} opened={opened} view={opened ? view : 'tokens'} onView={setView} />
					</div>
				)}
			</div>
			{/* Connecting another, in a modal over whatever is shown, with a way back to it. */}
			{ds.adding && <ConnectDesignSystem onConnected={() => void ds.showAnother()} onCancel={() => ds.setAdding(false)} />}
		</div>
	);
};

/**
 * The design system's own row, first under the top bar, on every view: its name, which switches between those connected
 * and connects another (P4), the branch it is read from, and at the right what is wrong with it, if anything (a failed
 * update, what could not be read), then Sync and More, which removes it. A skeleton while it is first read; nothing when
 * there is none shown, as there is nothing to name.
 */
const DesignSystemRow = ({ ds }: { ds: DesignSystemState }) => {
	const { catalog, systems, shown } = ds;
	if (catalog === null)
		return (
			<Toolbar>
				<Skeleton className="h-5 w-40" />
			</Toolbar>
		);
	if (catalog.state !== 'ready') return null;
	return (
		<Toolbar>
			{/* The screen's title is the design system shown, which is also how another is chosen. */}
			<h1 className="min-w-0">
				<DesignSystemSwitcher systems={systems.systems} shown={shown} onSelect={(id) => void ds.select(id)} onAdd={() => ds.setAdding(true)} />
			</h1>
			<LocationHint icon={GitBranchIcon} label={`Branch ${catalog.branch}`} value={catalog.branch} />
			<ToolbarEnd>
				<UpdateProblem update={catalog.update} />
				<TokenProblems problems={catalog.tokens.problems} />
				<SyncButton syncing={ds.syncing} onClick={() => void ds.sync()} />
				{shown && (
					<MoreMenu label={`More for ${shown.name}`}>
						<DropdownMenuItem variant="destructive" onSelect={() => void ds.remove(shown.id)}>
							<Trash2Icon />
							Remove
						</DropdownMenuItem>
					</MoreMenu>
				)}
			</ToolbarEnd>
		</Toolbar>
	);
};

/**
 * The side panel, at the right of the views and the full height under the design system's row (decision 21): at its top, as
 * high as the tab strip beside it so the two read as one line, the switch between the tokens and the open component, and
 * under it whichever is chosen. The tokens are hidden, not left, when the component is shown, so what was typed and
 * opened in them is as it was.
 */
const SidePanel = ({
	ds,
	catalog,
	opened,
	view,
	onView,
}: {
	ds: DesignSystemState;
	catalog: Extract<Catalog, { state: 'ready' }>;
	opened: CatalogComponent | undefined;
	view: PanelView;
	onView: (view: PanelView) => void;
}) => {
	// Where the change is kept, once saved (T4) and proposed (T5), and the change as every part of the panel that shows tokens
	// sees it: the panel's own, since nothing else shows them.
	const branch = useTokenBranch(ds.systems.current, ds.edits, ds.setEdits);
	const changes = useTokenChangesFor(catalog.tokens.tokens, ds.edits, ds.setEdits, catalog.accessibility);
	return (
		<ResizablePanel panel={TOKENS_PANEL} label="Resize the tokens panel">
			<div className="flex h-(--toolbar-height) shrink-0 items-center border-b px-4">
				<PanelSwitcher view={view} canShowComponent={opened !== undefined} onSelect={onView} />
			</div>
			<TokenChangesProvider value={changes}>
				<div data-panel="tokens" hidden={view !== 'tokens'} className="flex min-h-0 flex-1 flex-col">
					<TokensPanel tokens={catalog.tokens} live={opened !== undefined} branch={branch} />
				</div>
				{view === 'component' && opened && <ComponentPanel key={opened.id} component={opened} components={catalog.components} />}
			</TokenChangesProvider>
		</ResizablePanel>
	);
};

/**
 * The Components view: the design system connected, as its branch has it on GitHub, from a clone on this machine; with none,
 * the Connect screen. The components are the list, by default, with a search and List or Grid above it, and a component
 * once one is opened, with its stories live. The list stays mounted while a component is open, so the scroll and the search
 * survive both, and it stays mounted while hidden.
 */
const Components = ({
	hidden,
	ds,
	opened,
	onOpen,
}: {
	hidden: boolean;
	ds: DesignSystemState;
	opened: CatalogComponent | undefined;
	onOpen: (id: string | null) => void;
}) => {
	const { catalog, error, edits, shown } = ds;
	// The components as a list or a grid of cards with pictures (P5), as last chosen; the pictures while the grid shows.
	const [componentsView, chooseView] = useRememberedView(VIEW_KEY);
	// The pictures are the list's thumbnails and the grid's covers alike, so they are asked for whichever is shown.
	const pictures = useComponentPictures(!hidden && catalog?.state === 'ready', catalog?.state === 'ready' ? catalog.commit : null);
	// What is typed in the search over the list: the list or grid is narrowed to what matches.
	const [search, setSearch] = useState('');
	// The groups closed up: they stay closed while a component is opened.
	const closed = useClosedGroups();

	if (error && catalog === null) {
		return (
			<Page>
				<Notice variant="destructive" title="Could not read the component library" action={<RetryButton onClick={() => void ds.sync()} />}>
					{error}
				</Notice>
			</Page>
		);
	}
	// The view's shape until the library is read: the components as the list or grid last chosen.
	if (catalog === null)
		return (
			<SkeletonStatus label="Reading the component library…">
				<Page>{componentsView === 'grid' ? <CardGridSkeleton /> : <RowsSkeleton thumbnails />}</Page>
			</SkeletonStatus>
		);
	if (catalog.state === 'none') return <ConnectDesignSystem onConnected={() => void ds.showAnother()} />;
	if (catalog.state === 'lost') {
		return (
			<Page>
				<Notice
					title={`${catalog.name} is no longer on this computer`}
					action={
						<Button variant="outline" onClick={() => shown && void ds.remove(shown.id)}>
							Remove
						</Button>
					}
				>
					Its copy was at {catalog.root}. Remove it, then connect it again, or{' '}
					<InlineAction onClick={() => ds.setAdding(true)}>connect another</InlineAction>.
				</Notice>
			</Page>
		);
	}
	if (catalog.state === 'no-branch') {
		return (
			<Page>
				<Notice title={`This clone has no ${catalog.branch} branch`} action={<RetryButton onClick={() => void ds.sync()} />}>
					The clone at {catalog.root} has no {catalog.branch} branch from {HOST} to read, and no other branch is read in its place. Check it is a
					clone of the library, and that this computer can reach {HOST}.
				</Notice>
			</Page>
		);
	}

	return (
		<div className="h-full overflow-y-auto">
			{opened && <ComponentPage component={opened} commit={catalog.commit} edits={edits} onBack={() => onOpen(null)} />}
			{/* Kept while a component is open, so going back finds the list where it was. */}
			<div hidden={opened !== undefined}>
				<Page>
					<PageHeading title="Components" />
					{/* The list's own row, so it goes when a component is open: the search, and List or Grid at its right. */}
					<div data-components-search className="flex items-center justify-between gap-3">
						<SearchField label="Search components" value={search} onChange={setSearch} className="w-72" />
						<ViewSwitcher view={componentsView} onSelect={chooseView} />
					</div>
					{error && <ErrorAlert error={error} />}
					{catalog.components.length === 0 ? (
						<p className="text-muted-foreground text-sm">
							The library's Storybook has no stories on {catalog.branch}, so there are no components to list.
						</p>
					) : (
						<ComponentList
							components={catalog.components}
							search={search}
							onClearSearch={() => setSearch('')}
							view={componentsView}
							closed={closed}
							pictures={pictures}
							onOpen={onOpen}
						/>
					)}
				</Page>
			</div>
		</div>
	);
};
