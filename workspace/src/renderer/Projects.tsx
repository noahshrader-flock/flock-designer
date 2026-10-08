import { useCallback, useEffect, useState } from 'react';
import type { Checkout, CheckoutSuggestion, Project, ProjectIteration } from '../shared/contract';
import { LoadingScreen } from './Loading';
import { CardGrid } from './CardGrid';
import { NewWork, type Created } from './NewWork';
import { Page } from './Page';
import { ProjectCard } from './ProjectCard';
import { PublishBanner, PublishLine, usePublishStatus } from './PublishStatus';
import { RecordSheet } from './RecordSheet';
import { Review } from './Review';
import { SyncButton } from './SyncButton';
import { Toolbar } from './Toolbar';
import { Alert, AlertDescription } from './ui/alert';
import { Button } from './ui/button';

/**
 * Reviewer mode: every project in the design repository, read through the API.
 *
 * Nothing here needs a checkout, git, or the product's toolchain -- that is the
 * whole point. A PM installs the app, signs in, and sees this.
 */
export const Projects = ({ hidden }: { hidden: boolean }) => {
	const [projects, setProjects] = useState<Project[] | null>(null);
	const [error, setError] = useState<string | null>(null);
	// Kept after it closes so the panel can slide away still showing what it was showing.
	const [viewing, setViewing] = useState<{ project: Project; name: string; open: boolean } | null>(null);
	const [selected, setSelected] = useState<{ project: Project; iteration: ProjectIteration; task?: string } | null>(null);
	const [checkout, setCheckout] = useState<Checkout | null>(null);
	const [creating, setCreating] = useState(false);
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

	if (!projects) {
		return <LoadingScreen>Loading projects…</LoadingScreen>;
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

	return (
		<>
			{/* Stays put while the list scrolls under it, as it does on a prototype's screen. */}
			<Toolbar className="sticky top-0 z-40">
				<h2 className="text-sm font-semibold">Projects</h2>
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
					<Button size="sm" onClick={() => setCreating(true)}>
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
						<AlertDescription className="flex flex-wrap items-center justify-between gap-2">
							<span>Flock Designer could not find a Flock product repository on this machine. Point it at your product repository once.</span>
							<Button size="sm" onClick={chooseCheckout}>
								Find it
							</Button>
						</AlertDescription>
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

				{projects.length === 0 && (
					<p className="text-muted-foreground text-sm">
						No projects yet. A project appears here once its folder exists in the design repository.
					</p>
				)}

				{projects.length > 0 && (
					<CardGrid>
						{projects.map((project) => (
							<ProjectCard
								key={project.id}
								project={project}
								onOpen={(iteration) => setSelected({ project, iteration })}
								onViewRecord={(name) => setViewing({ project, name, open: true })}
							/>
						))}
					</CardGrid>
				)}
			</Page>
			{viewing && (
				<RecordSheet
					project={viewing.project}
					name={viewing.name}
					open={viewing.open}
					onClose={() => setViewing({ ...viewing, open: false })}
				/>
			)}
		</>
	);
};
