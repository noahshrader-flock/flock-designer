import { useCallback, useEffect, useState } from 'react';
import type { Checkout, CheckoutSuggestion, Person, Project, ProjectIteration } from '../shared/contract';
import { NewWork, type Created } from './NewWork';
import { People } from './People';
import { PublishBanner, usePublishStatus } from './PublishStatus';
import { startedAt } from '../shared/projects';
import { Review } from './Review';
import { Alert, AlertDescription } from './ui/alert';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';

/**
 * Reviewer mode: every project in the design repository, read through the API.
 *
 * Nothing here needs a checkout, git, or the product's toolchain -- that is the
 * whole point. A PM installs the app, signs in, and sees this.
 */
export const Projects = () => {
	const [projects, setProjects] = useState<Project[] | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [selected, setSelected] = useState<{ project: Project; iteration: ProjectIteration; task?: string } | null>(null);
	const [checkout, setCheckout] = useState<Checkout | null>(null);
	const [creating, setCreating] = useState(false);
	const [looked, setLooked] = useState(false);
	const [suggestion, setSuggestion] = useState<CheckoutSuggestion | null>(null);
	const [publishStatus, setPublishStatus] = usePublishStatus();

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
			<div className="flex flex-col gap-4">
				<Alert variant="destructive">
					<AlertDescription>{error}</AlertDescription>
				</Alert>
				<div>
					<Button variant="secondary" onClick={load}>
						Try again
					</Button>
				</div>
			</div>
		);
	}

	if (!projects) {
		return <p className="text-muted-foreground text-sm">Loading projects…</p>;
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
				onBack={() => {
					setSelected(null);
					void load();
				}}
			/>
		);
	}

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-row items-center gap-4">
				<h2 className="text-xl font-semibold">Projects</h2>
				<div className="grow" />
				{/* Refreshing is an explicit ask, so it also publishes, rather than waiting for the next trigger. */}
				<Button
					variant="secondary"
					onClick={() => {
						void window.workspace.publishNow().then((r) => r.ok && setPublishStatus(r.value));
						void load();
					}}
				>
					Refresh
				</Button>
				<Button onClick={() => setCreating(true)}>New prototype</Button>
			</div>
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
						<span>Flock Designer could not find a Flock product repository on this machine. Point it at your Coke folder once.</span>
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

			{projects.map((project) => (
				<Card key={project.id} className="gap-4 py-5">
					<CardHeader className="px-5">
						<CardTitle className="text-base">{project.title}</CardTitle>
						<CardDescription>
							{project.id}
							{startedAt(project) &&
								` · Started ${new Date(startedAt(project) as string).toLocaleDateString(undefined, {
									month: 'short',
									day: 'numeric',
									year: 'numeric',
								})}`}
						</CardDescription>
						{(project.localOnly || project.openComments > 0) && (
							<CardAction className="flex flex-row items-center gap-2">
								{project.localOnly && <Badge variant="secondary">Only on this machine</Badge>}
								{project.openComments > 0 && (
									<Badge variant="warning">
										{project.openComments} comment{project.openComments === 1 ? '' : 's'}
									</Badge>
								)}
							</CardAction>
						)}
					</CardHeader>
					<CardContent className="flex flex-col gap-3 px-5">
						<People people={project.people} empty="No contributors recorded yet" />

						<p className="text-muted-foreground text-sm">{project.records.join(' · ') || 'no records yet'}</p>

						{project.iterations.length === 0 ? (
							<p className="text-muted-foreground text-sm">No branches yet.</p>
						) : (
							<div className="flex flex-row flex-wrap gap-2">
								{project.iterations.map((iteration) => (
									<Button key={iteration.branch} variant="secondary" size="sm" onClick={() => setSelected({ project, iteration })}>
										{iteration.name}
										{iteration.localOnly && !project.localOnly ? ' · local' : ''}
									</Button>
								))}
							</div>
						)}
					</CardContent>
				</Card>
			))}
		</div>
	);
};
