import { GitBranchIcon, RefreshCwIcon, SearchIcon } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { isGap } from '../shared/catalog';
import type { Catalog, CatalogComponent, CatalogUpdate } from '../shared/contract';
import { LoadingScreen } from './Loading';
import { Toolbar } from './Toolbar';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Tabs, TabsList, TabsTrigger } from './ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

type Kind = 'all' | 'components' | 'composite';

const Page = ({ children }: { children: ReactNode }) => <div className="mx-auto flex max-w-[1400px] flex-col gap-4 p-6">{children}</div>;

/** Said only when something is wrong, as the Projects screen does: a failed update is a line, never an error. */
const UpdateProblem = ({ update }: { update: CatalogUpdate }) =>
	typeof update === 'object' ? (
		<span className="text-warning text-xs" role="status" title={update.failed}>
			Could not update from GitHub
		</span>
	) : null;

/** A link out. The window opens nothing itself: the app hands an https address to the system's browser. */
const Out = ({ href, children }: { href: string; children: ReactNode }) => (
	<a href={href} target="_blank" rel="noreferrer" className="text-primary text-sm underline-offset-4 hover:underline">
		{children}
	</a>
);

/** The part of a story's title after its group, so a folder with several stories says which is which. */
const storyName = (title: string | null): string => title?.split('/').pop() ?? 'Storybook';

const Row = ({ component, part }: { component: CatalogComponent; part: boolean }) => (
	<li className={`flex items-start gap-4 py-3 pr-4 ${part ? 'pl-10' : 'pl-4'}`} data-component={component.id}>
		<div className="flex min-w-0 grow flex-col gap-0.5">
			<span className="flex items-center gap-2">
				<span className={part ? 'text-sm' : 'text-sm font-medium'}>{component.name}</span>
				{isGap(component) && (
					<Badge variant="outline" className="text-muted-foreground">
						No story
					</Badge>
				)}
			</span>
			{component.subtitle && <span className="text-muted-foreground text-sm">{component.subtitle}</span>}
		</div>
		<div className="flex shrink-0 flex-wrap justify-end gap-x-4 gap-y-1">
			{component.stories.map((s) =>
				s.storybook === null ? null : (
					<Out key={s.file} href={s.storybook}>
						{component.stories.length > 1 ? `Storybook: ${storyName(s.title)}` : 'Storybook'}
					</Out>
				),
			)}
			<Out href={component.source}>Source</Out>
		</div>
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
 * (DESIGN_SYSTEM_PLAN.md). An index, not a second Storybook: each component is a name, a line and links to where it
 * is shown (Storybook) and written (Source).
 *
 * It reads once when first shown, at once from what the clone has, then again when GitHub has been asked for changes;
 * after that only when Refresh is pressed. It stays mounted while hidden, so the search and the scroll survive.
 */
export const DesignSystem = ({ hidden }: { hidden: boolean }) => {
	const [catalog, setCatalog] = useState<Catalog | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [refreshing, setRefreshing] = useState(false);
	const [query, setQuery] = useState('');
	const [kind, setKind] = useState<Kind>('all');
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

	const refresh = useCallback(async () => {
		setRefreshing(true);
		try {
			await ask(true);
		} finally {
			setRefreshing(false);
		}
	}, [ask]);

	useEffect(() => {
		if (hidden || started.current) return;
		started.current = true;
		void ask(false).then((first) => {
			// The first answer is what the clone already has; the second is after GitHub was asked for changes.
			if (first?.state === 'ready' && first.update === 'updating') void refresh();
		});
	}, [hidden, ask, refresh]);

	const shown = useMemo(() => {
		if (catalog?.state !== 'ready') return [];
		const q = query.trim().toLowerCase();
		return catalog.components.filter(
			(c) =>
				(kind === 'all' || (kind === 'composite') === c.composite) &&
				(q === '' || c.name.toLowerCase().includes(q) || (c.subtitle ?? '').toLowerCase().includes(q)),
		);
	}, [catalog, query, kind]);

	if (error && catalog === null) {
		return (
			<Notice title="Could not read the component library" action={<Button variant="secondary" size="sm" onClick={() => void refresh()}>Try again</Button>}>
				{error}
			</Notice>
		);
	}
	if (catalog === null) return <LoadingScreen>Reading the component library…</LoadingScreen>;
	if (catalog.state === 'no-clone') {
		return (
			<Notice title="The component library is not on this computer">
				The Design System tab reads {catalog.repository} from a clone on this computer. Clone it into the folder where your
				other repositories are, then come back to this tab.
			</Notice>
		);
	}
	if (catalog.state === 'no-develop') {
		return (
			<Notice title="This clone has no develop branch" action={<Button variant="secondary" size="sm" onClick={() => void refresh()}>Try again</Button>}>
				The clone at {catalog.root} has no develop branch from GitHub to read, and no other branch is read in its place.
				Check it is a clone of the library, and that this computer can reach GitHub.
			</Notice>
		);
	}

	const groups: { group: string; rows: CatalogComponent[] }[] = [];
	for (const c of shown) {
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
				<div className="grow" />
				{/* Where syncing is on the Projects screen: the problem, if there is one, beside the button. */}
				<div className="flex items-center gap-2">
					<UpdateProblem update={catalog.update} />
					<Button size="sm" variant="ghost" disabled={refreshing} onClick={() => void refresh()}>
						<RefreshCwIcon className={refreshing ? 'animate-spin' : undefined} />
						{refreshing ? 'Refreshing…' : 'Refresh'}
					</Button>
				</div>
			</Toolbar>
			<Page>
				{error && (
					<Alert variant="destructive">
						<AlertDescription>{error}</AlertDescription>
					</Alert>
				)}
				<div className="flex flex-wrap items-center gap-3">
					<div className="relative w-72">
						<SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
						<Input className="pl-8" placeholder="Search components" aria-label="Search components" value={query} onChange={(e) => setQuery(e.target.value)} />
					</div>
					<Tabs value={kind} onValueChange={(v) => setKind(v as Kind)}>
						<TabsList>
							<TabsTrigger value="all">All</TabsTrigger>
							<TabsTrigger value="components">Components</TabsTrigger>
							<TabsTrigger value="composite">Composite</TabsTrigger>
						</TabsList>
					</Tabs>
					<span className="text-muted-foreground text-sm">{catalog.components.length} components</span>
				</div>
				{catalog.components.length === 0 ? (
					<p className="text-muted-foreground text-sm">
						No components were found on develop, in src/components or src/compositeComponents.
					</p>
				) : groups.length === 0 ? (
					<p className="text-muted-foreground text-sm">No components match.</p>
				) : (
					groups.map(({ group, rows }) => (
						<section key={group} className="flex flex-col gap-2" aria-label={group}>
							<h3 className="text-sm font-semibold">
								{group} <span className="text-muted-foreground font-normal">{rows.length}</span>
							</h3>
							<ul className="bg-card divide-y rounded-lg border">
								{rows.map((c) => (
									<Row key={c.id} component={c} part={c.partOf !== null} />
								))}
							</ul>
						</section>
					))
				)}
			</Page>
		</>
	);
};
