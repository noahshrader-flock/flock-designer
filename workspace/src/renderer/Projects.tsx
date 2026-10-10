import { useCallback, useEffect, useState } from 'react';
import type { Checkout, CheckoutSuggestion, Project, ProjectIteration } from '../shared/contract';
import { CardGrid } from './CardGrid';
import { NewWork, type Created } from './NewWork';
import { Page } from './Page';
import { ProjectCard } from './ProjectCard';
import { ProjectSort } from './ProjectSort';
import { PublishBanner, PublishLine, usePublishStatus } from './PublishStatus';
import { Review } from './Review';
import { SyncButton } from './SyncButton';
import { Toolbar } from './Toolbar';
import { InfoIcon } from 'lucide-react';
import { type ProjectOrder, matchesProject, sortProjects } from '../shared/projects';
import { Alert, AlertAction, AlertDescription, AlertTitle } from './ui/alert';
import { Button } from './ui/button';
import { NoMatches } from './NoMatches';
import { SearchField } from './SearchField';
import { CardGridSkeleton, SkeletonStatus } from './Skeletons';

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
		} else {
			setError(result.error);
		}
	}, []);

	useEffect(() => {
		void load();
	}, [load]);

	/** Accepting the suggestion is what trusts it; finding it did not. */
	const useSuggestion = useCallback(async (root: string) => {
		const r = await window.workspace.useCheckout(root);
		if (r.ok) {
			setCheckout(r.value);
			setSuggestion(null);
			await load();
		}
	}, [load]);

	if (error) {
		return (
			<Page>
				<Alert variant="destructive">
					<AlertDescription>{error}</AlertDescription>
				</Alert>
				<div>
					<Button variant="secondary" onClick={load}>
						Try again
					</Button>
				</div>
			</Page>
		);
	}

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
				onBack={() => {
					setSelected(null);
					void load();
				}}
			/>
		);
	}

	const matching = sortProjects(
		(projects ?? []).filter((p) => matchesProject(p, search)),
		order,
	);

	return (
		<>
			{/* Stays put while the list scrolls under it, as it does on a prototype's screen. */}
			<Toolbar className="sticky top-0 z-40">
				<h2 className="text-sm font-semibold">Projects</h2>
				{projects !== null && projects.length > 0 && (
					<div className="flex items-center gap-2">
						<SearchField label="Search projects" value={search} onChange={setSearch} className="w-64" />
						<ProjectSort order={order} onChange={setOrder} />
					</div>
				)}
				<div className="grow" />
				<div className="flex items-center gap-2">
					{/* Where syncing is, beside the button that starts it, so the two always read together. */}
					<PublishLine status={publishStatus} />
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
					<Button onClick={() => setCreating(true)}>
						New
					</Button>
				</div>
			</Toolbar>
			<Page wide>
				<PublishBanner status={publishStatus} onChange={setPublishStatus} />
				{looked && !checkout && suggestion && (
					<Alert>
						<AlertDescription className="flex flex-wrap items-center justify-between gap-2">
							<span>
								Found {suggestion.product} at {suggestion.root}. Use it for building and previewing here?
							</span>
							<span className="flex flex-row gap-2">
								<Button size="sm" variant="secondary" onClick={chooseCheckout}>
									Choose another
								</Button>
								<Button size="sm" onClick={() => void useSuggestion(suggestion.root)}>
									Use this one
								</Button>
							</span>
						</AlertDescription>
					</Alert>
				)}
				{looked && !checkout && !suggestion && (
					<Alert>
						<InfoIcon />
						<AlertTitle>No product repository found</AlertTitle>
						<AlertDescription>DSNR could not find a Flock product repository on this machine. Point it at yours once.</AlertDescription>
						<AlertAction>
							<Button variant="outline" onClick={chooseCheckout}>
								Find it
							</Button>
						</AlertAction>
					</Alert>
				)}
				<NewWork
					open={creating}
					onClose={() => setCreating(false)}
					checkout={checkout}
					onChoose={chooseCheckout}
					onCheckout={setCheckout}
					onCreated={(c: Created) => {
						setCreating(false);
						setSelected({ project: c.project, iteration: c.iteration, task: c.task });
					}}
				/>

				{/* The cards' shapes until the projects are read, under the screen's own toolbar. */}
				{projects === null && (
					<SkeletonStatus label="Loading projects…">
						<CardGridSkeleton />
					</SkeletonStatus>
				)}

				{projects?.length === 0 && (
					<p className="text-muted-foreground text-sm">
						No projects yet. A project appears here once its folder exists in the design repository.
					</p>
				)}

				{matching.length === 0 && projects !== null && projects.length > 0 && (
					<NoMatches thing="project" search={search} onClear={() => setSearch('')} />
				)}

				{matching.length > 0 && (
					<CardGrid>
						{matching.map((project) => (
							<ProjectCard
								key={project.id}
								project={project}
								onOpen={(iteration) => setSelected({ project, iteration })}
							/>
						))}
					</CardGrid>
				)}
			</Page>
		</>
	);
};
