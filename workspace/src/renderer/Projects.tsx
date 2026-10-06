import { ChevronDownIcon, FolderIcon, MessageSquareIcon, RefreshCwIcon } from 'lucide-react';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { Checkout, CheckoutSuggestion, IterationKind, Person, Project, ProjectIteration } from '../shared/contract';
import { LoadingScreen } from './Loading';
import { NewWork, type Created } from './NewWork';
import { People } from './People';
import { PublishBanner, usePublishStatus } from './PublishStatus';
import { startedAt } from '../shared/projects';
import { RecordSheet } from './RecordSheet';
import { Review } from './Review';
import { Toolbar } from './Toolbar';
import { Alert, AlertDescription } from './ui/alert';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

/** A name as it reads on a button: the first letter capital, the rest as written. */
const sentence = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** The list's own padding and width, under the toolbar. The toolbar is full width, so it is not inside this. */
const Page = ({ children }: { children: ReactNode }) => (
	<div className="mx-auto flex max-w-[1400px] flex-col gap-4 p-6">{children}</div>
);

/**
 * Reviewer mode: every project in the design repository, read through the API.
 *
 * Nothing here needs a checkout, git, or the product's toolchain -- that is the
 * whole point. A PM installs the app, signs in, and sees this.
 */
export const Projects = ({ menuOpen }: { menuOpen: boolean }) => {
	const [projects, setProjects] = useState<Project[] | null>(null);
	const [error, setError] = useState<string | null>(null);
	// Kept after it closes so the panel can slide away still showing what it was showing.
	const [viewing, setViewing] = useState<{ project: Project; name: string; open: boolean } | null>(null);
	const [selected, setSelected] = useState<{ project: Project; iteration: ProjectIteration; task?: string } | null>(null);
	const [checkout, setCheckout] = useState<Checkout | null>(null);
	const [creating, setCreating] = useState(false);
	// Kept after the dialog closes, so its title does not change while it fades out.
	const [newKind, setNewKind] = useState<IterationKind>('prototype');
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
				menuOpen={menuOpen}
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
					{/* Refreshing is an explicit ask, so it also publishes, rather than waiting for the next trigger. */}
					<Button
						size="sm"
						variant="ghost"
						onClick={() => {
							void window.workspace.publishNow().then((r) => r.ok && setPublishStatus(r.value));
							void load();
						}}
					>
						<RefreshCwIcon />
						Refresh
					</Button>
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button size="sm">
								New
								<ChevronDownIcon />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="w-auto">
							{(
								[
									['codebase', 'Codebase feature'],
									['prototype', 'Prototype'],
								] as const
							).map(([kind, label]) => (
								<DropdownMenuItem
									key={kind}
									onSelect={() => {
										setNewKind(kind);
										setCreating(true);
									}}
								>
									{label}
								</DropdownMenuItem>
							))}
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</Toolbar>
			<Page>
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
					kind={newKind}
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

				{projects.map((project) => (
					<Card key={project.id}>
						<CardHeader>
							<CardTitle>{project.title}</CardTitle>
							<CardDescription className="flex items-center gap-1.5">
								<FolderIcon className="size-4 shrink-0" />
								<span className="font-mono">{project.id}</span>
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
										<Tooltip>
											<TooltipTrigger asChild>
												<Badge
													variant="secondary"
													aria-label={`${project.openComments} open comment${project.openComments === 1 ? '' : 's'}`}
												>
													<MessageSquareIcon />
													{project.openComments}
												</Badge>
											</TooltipTrigger>
											<TooltipContent>
												{project.openComments} comment{project.openComments === 1 ? '' : 's'}
											</TooltipContent>
										</Tooltip>
									)}
								</CardAction>
							)}
						</CardHeader>
						<CardContent>
							<People people={project.people} empty="No contributors recorded yet" />
						</CardContent>
						<CardFooter className="flex-wrap justify-between gap-2">
							<div className="flex flex-row flex-wrap items-center gap-2">
								{project.iterations.length === 0 && <span className="text-muted-foreground px-2 text-sm">No branches yet.</span>}
								{project.iterations.map((iteration) => (
									<Button key={iteration.branch} variant="outline" size="sm" onClick={() => setSelected({ project, iteration })}>
										{sentence(iteration.name)}
										{iteration.localOnly && !project.localOnly ? ' · local' : ''}
									</Button>
								))}
							</div>
							<div className="ml-auto flex flex-row flex-wrap items-center">
								{project.records.map((record) => (
									<Button key={record} variant="ghost" size="sm" onClick={() => setViewing({ project, name: record, open: true })}>
										{sentence(record.replace(/\.[^.]+$/, '').replace(/-/g, ' '))}
									</Button>
								))}
							</div>
						</CardFooter>
					</Card>
				))}
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
