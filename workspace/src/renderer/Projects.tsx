import { useCallback, useEffect, useState } from 'react';
import type { Checkout, CheckoutSuggestion, Project, ProjectIteration } from '../shared/contract';
import { CardGrid } from './CardGrid';
import { NewWork, type Created } from './NewWork';
import { Page } from './Page';
import { RowList } from './ListRow';
import { ProjectCard } from './ProjectCard';
import { ProjectRow } from './ProjectRow';
import { FolderFilter } from './FolderFilter';
import { ProjectSort } from './ProjectSort';
import { PublishProblems, usePublishStatus } from './PublishStatus';
import { Review } from './Review';
import { SyncButton } from './SyncButton';
import { Toolbar, ToolbarEnd } from './Toolbar';
import { ALL_FOLDERS, type FolderChoice, foldersOf, inFolder } from '../shared/brief';
import { type ProjectOrder, matchesProject, sortProjects, withCovers } from '../shared/projectList';
import { Button } from './ui/button';
import { NoMatches } from './NoMatches';
import { SearchField } from './SearchField';
import { CardGridSkeleton, RowsSkeleton, SkeletonStatus } from './Skeletons';
import { ViewSwitcher, useRememberedView } from './ViewSwitcher';
import { NoRepositoryAlert, Notice, RetryButton } from './Notice';
import { InlineAction } from './Links';

/** Where the screen's choice of list or grid is kept: its own, apart from the Design System's. */
const VIEW_KEY = 'dsnr.projectsView';

/**
 * Reviewer mode: every project in the design repository, read through the API.
 *
 * Nothing here needs a checkout, git, or the product's toolchain -- that is the
 * whole point. A PM installs the app, signs in, and sees this.
 */
export const Projects = ({ hidden }: { hidden: boolean }) => {
	const [projects, setProjects] = useState<Project[] | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [selected, setSelected] = useState<{ project: Project; iteration: ProjectIteration; task?: string } | null>(null);
	const [checkout, setCheckout] = useState<Checkout | null>(null);
	const [creating, setCreating] = useState(false);
	// What is typed in the search beside the name of the screen: the cards are narrowed to what matches.
	const [search, setSearch] = useState('');
	// The most recent activity first, until it is changed.
	const [order, setOrder] = useState<ProjectOrder>('updated');
	// The folder shown: every project, those in no folder, or one folder's.
	const [folder, setFolder] = useState<FolderChoice>(ALL_FOLDERS);
	// Cards in a grid, as the screen has always been, or rows in a list: as last chosen here.
	const [view, chooseView] = useRememberedView(VIEW_KEY, 'grid');
	const [looked, setLooked] = useState(false);
	const [suggestion, setSuggestion] = useState<CheckoutSuggestion | null>(null);
	const [publishStatus, setPublishStatus] = usePublishStatus();
	// Sync is in progress from the click until both halves are done, and while the app syncs by itself.
	const [syncClicked, setSyncClicked] = useState(false);
	const syncing = syncClicked || publishStatus.state === 'working';

	// The checkout is chosen once and remembered.
	useEffect(() => {
		void window.workspace.lastCheckout().then(async (r) => {
			if (r.ok && r.value) setCheckout(r.value);
			else {
				// Nothing trusted yet: offer what is on the machine, for one click.
				const s = await window.workspace.suggestCheckout();
				if (s.ok) setSuggestion(s.value);
			}
			setLooked(true);
		});
	}, []);
	const chooseCheckout = useCallback(async () => {
		const r = await window.workspace.chooseCheckout();
		if (r.ok && r.value) {
			setCheckout(r.value);
			setSuggestion(null);
		}
	}, []);

	const load = useCallback(async () => {
		setError(null);
		const result = await window.workspace.listProjects();
		if (result.ok) {
			setProjects(result.value);
			// With the list on screen: pictures for the prototypes built here that have none current, taken in once made.
			void window.workspace.ensureCovers().then((made) => {
				if (made.ok && made.value.length > 0) setProjects((now) => (now === null ? now : withCovers(now, made.value)));
			});
		} else {
			setError(result.error);
		}
	}, []);

	useEffect(() => {
		void load();
	}, [load]);

	/** Accepting the suggestion is what trusts it; finding it did not. */
	const acceptSuggestion = useCallback(
		async (root: string) => {
			const r = await window.workspace.useCheckout(root);
			if (r.ok) {
				setCheckout(r.value);
				setSuggestion(null);
				await load();
			}
		},
		[load],
	);

	if (error) {
		return (
			<Page>
				<Notice variant="destructive" title="Could not read the projects" action={<RetryButton onClick={load} />}>
					{error}
				</Notice>
			</Page>
		);
	}

	// The folders projects are in, for the filter, New and Assign folder alike.
	const folders = foldersOf(projects ?? []);
	const unfiled = (projects ?? []).some((p) => inFolder(p, { kind: 'none' }));
	// A folder chosen that no project is in any more (moved since, on another machine) shows them all again.
	const shown = (projects ?? []).some((p) => inFolder(p, folder)) ? folder : ALL_FOLDERS;

	if (selected) {
		return (
			<Review
				// A new key per iteration, so opening another one starts it fresh.
				key={`${selected.project.id}/${selected.iteration.name}`}
				project={selected.project}
				iteration={selected.iteration}
				checkout={checkout}
				onChoose={chooseCheckout}
				task={selected.task}
				hidden={hidden}
				onOpen={(project, iteration, task) => setSelected({ project, iteration, task })}
				folders={folders}
				onBack={() => {
					setSelected(null);
					void load();
				}}
			/>
		);
	}

	const matching = sortProjects(
		(projects ?? []).filter((p) => inFolder(p, shown) && matchesProject(p, search)),
		order,
	);
	// Opening a project into one of its prototypes, from its card or its row alike.
	const openIn = (project: Project) => (iteration: ProjectIteration) => setSelected({ project, iteration });

	return (
		<>
			{/* Stays put while the list scrolls under it, as it does on a prototype's screen. */}
			<Toolbar className="sticky top-0 z-(--layer-screen)">
				<h2 className="text-sm font-semibold">Projects</h2>
				{projects !== null && projects.length > 0 && (
					<div className="flex items-center gap-2">
						<SearchField label="Search projects" value={search} onChange={setSearch} className="w-64" />
						<ProjectSort order={order} onChange={setOrder} />
						{/* Only once a project is in a folder: before that it would only say All folders. */}
						{folders.length > 0 && <FolderFilter folders={folders} unfiled={unfiled} folder={shown} onChange={setFolder} />}
						{/* List or grid, with the other ways of looking at the list: Sync's side is for what syncing says. */}
						<ViewSwitcher view={view} onSelect={chooseView} />
					</div>
				)}
				<ToolbarEnd>
					{/* What is not synced, beside the button that starts one, so the two read together (as on the Design System). */}
					<PublishProblems status={publishStatus} />
					{/* Sync sends what is waiting and reads what is new, rather than waiting for the next trigger. */}
					<SyncButton
						syncing={syncing}
						onClick={() => {
							setSyncClicked(true);
							void Promise.all([window.workspace.publishNow().then((r) => r.ok && setPublishStatus(r.value)), load()]).finally(() =>
								setSyncClicked(false),
							);
						}}
					/>
					<Button onClick={() => setCreating(true)}>New</Button>
				</ToolbarEnd>
			</Toolbar>
			<Page wide>
				{looked && !checkout && suggestion && (
					<Notice
						title={`Found ${suggestion.product}`}
						action={
							<Button variant="outline" onClick={() => void acceptSuggestion(suggestion.root)}>
								Use this one
							</Button>
						}
					>
						At {suggestion.root}. Use it for building and previewing here, or <InlineAction onClick={chooseCheckout}>choose another</InlineAction>.
					</Notice>
				)}
				{looked && !checkout && !suggestion && <NoRepositoryAlert onFind={chooseCheckout} />}
				<NewWork
					open={creating}
					onClose={() => setCreating(false)}
					checkout={checkout}
					onChoose={chooseCheckout}
					onCheckout={setCheckout}
					folders={folders}
					folder={shown.kind === 'folder' ? shown.name : null}
					onCreated={(c: Created) => {
						setCreating(false);
						setSelected({ project: c.project, iteration: c.iteration, task: c.task });
					}}
				/>

				{/* The shapes of what is coming, cards or rows, until the projects are read, under the screen's own toolbar. */}
				{projects === null && (
					<SkeletonStatus label="Loading projects…">{view === 'grid' ? <CardGridSkeleton detail /> : <RowsSkeleton thumbnails />}</SkeletonStatus>
				)}

				{projects?.length === 0 && (
					<p className="text-muted-foreground text-sm">No projects yet. A project appears here once its folder exists in the design repository.</p>
				)}

				{matching.length === 0 && projects !== null && projects.length > 0 && (
					<NoMatches thing="project" search={search} onClear={() => setSearch('')} />
				)}

				{matching.length > 0 &&
					(view === 'grid' ? (
						<CardGrid>
							{matching.map((project) => (
								<ProjectCard key={project.id} project={project} onOpen={openIn(project)} />
							))}
						</CardGrid>
					) : (
						<RowList>
							{matching.map((project) => (
								<ProjectRow key={project.id} project={project} onOpen={openIn(project)} />
							))}
						</RowList>
					))}
			</Page>
		</>
	);
};
