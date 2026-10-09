import { ChevronDownIcon, ChevronRightIcon, GitBranchIcon, InfoIcon, PlusIcon, SwatchBookIcon, Trash2Icon } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Catalog, CatalogComponent, CatalogUpdate, ConnectedDesignSystem, ConnectedDesignSystems, Result } from '../shared/contract';
import { ComponentPage } from './ComponentPage';
import { ConnectDesignSystem } from './ConnectDesignSystem';
import { LoadingScreen } from './Loading';
import { MoreMenu } from './MoreMenu';
import { Page } from './Page';
import { TOKENS_PANEL } from './panelWidth';
import { ResizablePanel } from './ResizablePanel';
import { SearchSelect } from './SearchSelect';
import { SyncButton } from './SyncButton';
import { TokensPanel } from './TokensPanel';
import { Toolbar } from './Toolbar';
import { Alert, AlertAction, AlertDescription, AlertTitle } from './ui/alert';
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
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

/** Said only when something is wrong, as the Projects screen does: a failed update is a line, never an error. */
const UpdateProblem = ({ update }: { update: CatalogUpdate }) =>
	typeof update === 'object' ? (
		<span className="text-warning text-xs" role="status" title={update.failed}>
			Could not update from GitHub
		</span>
	) : null;

/** A component in the list: the whole row opens it, and the chevron says so. Its links are on its own page. */
const Row = ({ component, onOpen }: { component: CatalogComponent; onOpen: () => void }) => (
	<li data-component={component.id}>
		<button type="button" className="hover:bg-muted/50 flex w-full items-center gap-4 px-4 py-3 text-left" onClick={onOpen}>
			<span className="flex min-w-0 grow flex-col gap-0.5">
				<span className="text-sm font-medium">{component.name}</span>
				{component.subtitle && <span className="text-muted-foreground text-sm">{component.subtitle}</span>}
			</span>
			<ChevronRightIcon aria-hidden className="text-muted-foreground size-4 shrink-0" />
		</button>
	</li>
);

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

/** What a person sees in place of the list when there is no list, and, when there is a way to, a Try again. */
const Notice = ({ title, children, onRetry }: { title: string; children: ReactNode; onRetry?: () => void }) => (
	<Page>
		<Alert>
			<InfoIcon />
			<AlertTitle>{title}</AlertTitle>
			<AlertDescription>{children}</AlertDescription>
			{onRetry && (
				<AlertAction>
					<Button variant="outline" onClick={onRetry}>
						Try again
					</Button>
				</AlertAction>
			)}
		</Alert>
	</Page>
);

/**
 * The Design System tab: the component library as its branch has it on GitHub, from a clone on this machine
 * (DESIGN_SYSTEM_PLAN.md), as its Storybook lists it. The list, by default; a component, once one is opened from its row
 * or the toolbar's finder, with its stories live. Not a second Storybook: docs and controls stay there, behind each component's links.
 *
 * It reads once when first shown, at once from what the clone has, then again when GitHub has been asked for changes;
 * after that only when Sync is pressed. It stays mounted while hidden, and the list stays mounted while a component is
 * open, so the scroll survives both.
 */
export const DesignSystem = ({ hidden }: { hidden: boolean }) => {
	const [catalog, setCatalog] = useState<Catalog | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [syncing, setSyncing] = useState(false);
	// The component open on its own page, by id; the list when there is none.
	const [open, setOpen] = useState<string | null>(null);
	// The tokens panel at the right of the tab (decision 21): shown unless it was hidden, whichever screen is open.
	const [tokensOpen, setTokensOpen] = useState(true);
	// The design systems connected, and which is shown (P4); and whether another is being connected.
	const [systems, setSystems] = useState<ConnectedDesignSystems>({ systems: [], current: null });
	const [adding, setAdding] = useState(false);
	const started = useRef(false);

	const ask = useCallback(async (refresh: boolean): Promise<Catalog | null> => {
		const r = await window.workspace.designSystemCatalog(refresh);
		if (!r.ok) {
			setError(r.error);
			return null;
		}
		setError(null);
		setCatalog(r.value);
		return r.value;
	}, []);

	const sync = useCallback(async () => {
		setSyncing(true);
		try {
			await ask(true);
		} finally {
			setSyncing(false);
		}
	}, [ask]);

	// The first answer is what the clone already has; the second is after GitHub was asked for changes.
	const firstRead = useCallback(async () => {
		const first = await ask(false);
		if (first?.state === 'ready' && first.update === 'updating') void sync();
	}, [ask, sync]);

	const listSystems = useCallback(async () => {
		const r = await window.workspace.designSystems();
		if (r.ok) setSystems(r.value);
	}, []);

	useEffect(() => {
		if (hidden || started.current) return;
		started.current = true;
		void listSystems();
		void firstRead();
	}, [hidden, firstRead, listSystems]);

	// Another one shown (connected, switched to, or the one shown removed): read afresh, at its list.
	const showAnother = useCallback(async () => {
		setAdding(false);
		setOpen(null);
		setCatalog(null);
		await listSystems();
		await firstRead();
	}, [listSystems, firstRead]);
	// Switching to one, or removing the one shown: either way another is shown, or what went wrong is said.
	const thenShow = async (done: Promise<Result<null>>) => {
		const r = await done;
		if (r.ok) void showAnother();
		else setError(r.error);
	};
	const select = (id: string) => thenShow(window.workspace.selectDesignSystem(id));
	const remove = (id: string) => thenShow(window.workspace.removeDesignSystem(id));
	const shown = systems.systems.find((s) => s.id === systems.current) ?? null;

	if (error && catalog === null) {
		return (
			<Notice title="Could not read the component library" onRetry={() => void sync()}>
				{error}
			</Notice>
		);
	}
	// Connecting another, with a way back to the one shown.
	if (adding) return <ConnectDesignSystem onConnected={() => void showAnother()} onCancel={() => setAdding(false)} />;
	if (catalog === null) return <LoadingScreen>Reading the component library…</LoadingScreen>;
	if (catalog.state === 'none') return <ConnectDesignSystem onConnected={() => void showAnother()} />;
	if (catalog.state === 'lost') {
		return (
			<Notice title={`${catalog.name} is no longer on this computer`}>
				Its copy was at {catalog.root}. Remove it, then connect it again, or connect another.
				<div className="mt-3 flex gap-2">
					<Button variant="outline" onClick={() => shown && void remove(shown.id)}>
						Remove {catalog.name}
					</Button>
					<Button variant="ghost" onClick={() => setAdding(true)}>
						Connect a design system
					</Button>
				</div>
			</Notice>
		);
	}
	if (catalog.state === 'no-branch') {
		return (
			<Notice title={`This clone has no ${catalog.branch} branch`} onRetry={() => void sync()}>
				The clone at {catalog.root} has no {catalog.branch} branch from GitHub to read, and no other branch is read in its place.
				Check it is a clone of the library, and that this computer can reach GitHub.
			</Notice>
		);
	}

	const byId = new Map(catalog.components.map((c) => [c.id, c]));
	// The finder picks by what it shows, so a name two components share is shown with its group.
	const shared = new Set(catalog.components.map((c) => c.name).filter((n, i, all) => all.indexOf(n) !== i));
	const label = (c: CatalogComponent) => (shared.has(c.name) ? `${c.group} / ${c.name}` : c.name);
	// A component a sync removed is closed rather than shown from a list that no longer has it.
	const opened = open === null ? undefined : byId.get(open);
	const groups: { group: string; rows: CatalogComponent[] }[] = [];
	for (const c of catalog.components) {
		const last = groups[groups.length - 1];
		if (last?.group === c.group) last.rows.push(c);
		else groups.push({ group: c.group, rows: [c] });
	}

	return (
		<>
			<Toolbar className="sticky top-0 z-40">
				<DesignSystemSwitcher systems={systems.systems} shown={shown} onSelect={(id) => void select(id)} onAdd={() => setAdding(true)} />
				<Tooltip delayDuration={300}>
					<TooltipTrigger asChild>
						<GitBranchIcon aria-label={`Branch ${catalog.branch}`} className="text-muted-foreground size-4 shrink-0" />
					</TooltipTrigger>
					<TooltipContent side="bottom" className="font-mono">
						{catalog.branch}
					</TooltipContent>
				</Tooltip>
				<div className="ml-2 w-72">
					<SearchSelect
						items={catalog.components.map(label)}
						value={opened ? label(opened) : null}
						onChange={(chosen) => setOpen(catalog.components.find((c) => label(c) === chosen)?.id ?? null)}
						placeholder="Find a component"
						search="Search components…"
						empty="No component matches."
					/>
				</div>
				<div className="grow" />
				{/* Where syncing is on the Projects screen: the problem, if there is one, beside the button. */}
				<div className="flex items-center gap-2">
					<UpdateProblem update={catalog.update} />
					<Button variant="outline" aria-pressed={tokensOpen} onClick={() => setTokensOpen((o) => !o)}>
						<SwatchBookIcon />
						Tokens
					</Button>
					<SyncButton syncing={syncing} onClick={() => void sync()} />
					{shown && (
						<MoreMenu label={`More for ${shown.name}`}>
							<DropdownMenuItem variant="destructive" onSelect={() => void remove(shown.id)}>
								<Trash2Icon />
								Remove {shown.name}
							</DropdownMenuItem>
						</MoreMenu>
					)}
				</div>
			</Toolbar>
			{/* The tab under its bars: the list or a component, which scrolls on its own, and at the right the tokens panel,
			    which does not move when either changes. */}
			<div className="flex h-[calc(100dvh-var(--nav-height)-var(--toolbar-height))]">
				<div className="min-w-0 flex-1 overflow-y-auto">
					{opened && <ComponentPage component={opened} commit={catalog.commit} onBack={() => setOpen(null)} />}
					{/* Kept while a component is open, so going back finds the list where it was. */}
					<div hidden={opened !== undefined}>
						<Page>
							{error && (
								<Alert variant="destructive">
									<AlertDescription>{error}</AlertDescription>
								</Alert>
							)}
							{catalog.components.length === 0 ? (
								<p className="text-muted-foreground text-sm">
									The library's Storybook has no stories on {catalog.branch}, so there are no components to list.
								</p>
							) : (
								groups.map(({ group, rows }) => (
									<section key={group} className="flex flex-col gap-2" aria-label={group}>
										<h3 className="text-sm font-semibold">
											{group} <span className="text-muted-foreground font-normal">{rows.length}</span>
										</h3>
										<ul className="bg-card divide-y rounded-lg border">
											{rows.map((c) => (
												<Row key={c.id} component={c} onOpen={() => setOpen(c.id)} />
											))}
										</ul>
									</section>
								))
							)}
						</Page>
				</div>
				</div>
				{tokensOpen && (
					<ResizablePanel panel={TOKENS_PANEL} label="Resize the tokens panel">
						<TokensPanel tokens={catalog.tokens} />
					</ResizablePanel>
				)}
			</div>
		</>
	);
};
