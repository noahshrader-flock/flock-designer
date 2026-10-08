import { ChevronRightIcon, GitBranchIcon } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { isGap } from '../shared/catalog';
import type { Catalog, CatalogComponent, CatalogUpdate } from '../shared/contract';
import { ComponentPage } from './ComponentPage';
import { ConnectDesignSystem } from './ConnectDesignSystem';
import { LoadingScreen } from './Loading';
import { Page } from './Page';
import { SearchSelect } from './SearchSelect';
import { SyncButton } from './SyncButton';
import { Toolbar } from './Toolbar';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

/** Said only when something is wrong, as the Projects screen does: a failed update is a line, never an error. */
const UpdateProblem = ({ update }: { update: CatalogUpdate }) =>
	typeof update === 'object' ? (
		<span className="text-warning text-xs" role="status" title={update.failed}>
			Could not update from GitHub
		</span>
	) : null;

/** A component in the list: the whole row opens it, and the chevron says so. Its links are on its own page. */
const Row = ({ component, part, onOpen }: { component: CatalogComponent; part: boolean; onOpen: () => void }) => (
	<li data-component={component.id}>
		<button
			type="button"
			className={`hover:bg-muted/50 flex w-full items-center gap-4 py-3 pr-4 text-left ${part ? 'pl-10' : 'pl-4'}`}
			onClick={onOpen}
		>
			<span className="flex min-w-0 grow flex-col gap-0.5">
				<span className="flex items-center gap-2">
					<span className={part ? 'text-sm' : 'text-sm font-medium'}>{component.name}</span>
					{isGap(component) && (
						<Badge variant="outline" className="text-muted-foreground">
							No story
						</Badge>
					)}
				</span>
				{component.subtitle && <span className="text-muted-foreground text-sm">{component.subtitle}</span>}
			</span>
			<ChevronRightIcon aria-hidden className="text-muted-foreground size-4 shrink-0" />
		</button>
	</li>
);

/** What a person sees in place of the list when there is no list, and what to do about it. */
const Notice = ({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) => (
	<Page>
		<Alert>
			<AlertTitle>{title}</AlertTitle>
			<AlertDescription className="flex flex-col items-start gap-3">
				<span>{children}</span>
				{action}
			</AlertDescription>
		</Alert>
	</Page>
);

/**
 * The Design System tab: the component library as its `develop` branch has it, from a clone on this machine
 * (DESIGN_SYSTEM_PLAN.md). The list, by default; a component, once one is opened from its row or the toolbar's finder,
 * with its stories live. Not a second Storybook: docs and controls stay there, behind each component's links.
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

	useEffect(() => {
		if (hidden || started.current) return;
		started.current = true;
		void firstRead();
	}, [hidden, firstRead]);

	if (error && catalog === null) {
		return (
			<Notice title="Could not read the component library" action={<Button variant="secondary" size="sm" onClick={() => void sync()}>Try again</Button>}>
				{error}
			</Notice>
		);
	}
	if (catalog === null) return <LoadingScreen>Reading the component library…</LoadingScreen>;
	if (catalog.state === 'no-clone') {
		return (
			<ConnectDesignSystem repository={catalog.repository} lost={catalog.lost} onConnected={() => void firstRead()} />
		);
	}
	if (catalog.state === 'no-develop') {
		return (
			<Notice title="This clone has no develop branch" action={<Button variant="secondary" size="sm" onClick={() => void sync()}>Try again</Button>}>
				The clone at {catalog.root} has no develop branch from GitHub to read, and no other branch is read in its place.
				Check it is a clone of the library, and that this computer can reach GitHub.
			</Notice>
		);
	}

	const byId = new Map(catalog.components.map((c) => [c.id, c]));
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
				<h2 className="text-sm font-semibold">FUI</h2>
				<Tooltip delayDuration={300}>
					<TooltipTrigger asChild>
						<GitBranchIcon aria-label="Branch develop" className="text-muted-foreground size-4 shrink-0" />
					</TooltipTrigger>
					<TooltipContent side="bottom" className="font-mono">
						develop
					</TooltipContent>
				</Tooltip>
				<div className="ml-2 w-72">
					<SearchSelect
						items={catalog.components.map((c) => c.name)}
						value={opened?.name ?? null}
						onChange={(name) => setOpen(catalog.components.find((c) => c.name === name)?.id ?? null)}
						placeholder="Find a component"
						search="Search components…"
						empty="No component matches."
					/>
				</div>
				<div className="grow" />
				{/* Where syncing is on the Projects screen: the problem, if there is one, beside the button. */}
				<div className="flex items-center gap-2">
					<UpdateProblem update={catalog.update} />
					<SyncButton syncing={syncing} onClick={() => void sync()} />
				</div>
			</Toolbar>
			{opened && (
				<ComponentPage
					component={opened}
					parent={opened.partOf === null ? null : (byId.get(opened.partOf) ?? null)}
					commit={catalog.commit}
					onBack={() => setOpen(null)}
					onOpen={setOpen}
				/>
			)}
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
							No components were found on develop, in src/components or src/compositeComponents.
						</p>
					) : (
						groups.map(({ group, rows }) => (
							<section key={group} className="flex flex-col gap-2" aria-label={group}>
								<h3 className="text-sm font-semibold">
									{group} <span className="text-muted-foreground font-normal">{rows.length}</span>
								</h3>
								<ul className="bg-card divide-y rounded-lg border">
									{rows.map((c) => (
										<Row key={c.id} component={c} part={c.partOf !== null} onOpen={() => setOpen(c.id)} />
									))}
								</ul>
							</section>
						))
					)}
				</Page>
			</div>
		</>
	);
};
