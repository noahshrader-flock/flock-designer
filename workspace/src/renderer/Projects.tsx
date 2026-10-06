import {
	FSAlert,
	FSAvatar,
	FSBox,
	FSButton,
	FSChip,
	FSStack,
	FSTypography,
} from '@flocksafety/flock-react-component-lib';
import { useCallback, useEffect, useState } from 'react';
import type { Checkout, CheckoutSuggestion, Person, Project, ProjectIteration } from '../shared/contract';
import { NewWork, type Created } from './NewWork';
import { People } from './People';
import { PublishBanner, usePublishStatus } from './PublishStatus';
import { startedAt } from '../shared/projects';
import { Review } from './Review';

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
			<FSStack spacing={2}>
				<FSAlert severity="error">{error}</FSAlert>
				<FSBox>
					<FSButton size="md" variant="secondary" onClick={load}>
						Try again
					</FSButton>
				</FSBox>
			</FSStack>
		);
	}

	if (!projects) {
		return <FSTypography variant="body2">Loading projects…</FSTypography>;
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
		<FSStack spacing={2}>
			<FSStack direction="row" alignItems="center" spacing={2}>
				<FSTypography variant="h6" component="h2">
					Projects
				</FSTypography>
				<FSBox flexGrow={1} />
				{/* Refreshing is an explicit ask, so it also publishes, rather than waiting for the next trigger. */}
				<FSButton
					size="md"
					variant="secondary"
					onClick={() => {
						void window.workspace.publishNow().then((r) => r.ok && setPublishStatus(r.value));
						void load();
					}}
				>
					Refresh
				</FSButton>
				<FSButton size="md" onClick={() => setCreating(true)}>New prototype</FSButton>
			</FSStack>
			<PublishBanner status={publishStatus} onChange={setPublishStatus} />
			{looked && !checkout && suggestion && (
				<FSAlert
					severity="info"
					action={
						<FSStack direction="row" spacing={1}>
							<FSButton size="md" variant="secondary" onClick={chooseCheckout}>
								Choose another
							</FSButton>
							<FSButton size="md" onClick={() => void useSuggestion(suggestion.root)}>Use this one</FSButton>
						</FSStack>
					}
				>
					Found {suggestion.product} at {suggestion.root}. Use it for building and previewing here?
				</FSAlert>
			)}
			{looked && !checkout && !suggestion && (
				<FSAlert severity="info" action={<FSButton size="md" onClick={chooseCheckout}>Find it</FSButton>}>
					Flock Designer could not find a Flock product repository on this machine. Point it at your Coke folder once.
				</FSAlert>
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
				<FSTypography variant="body2" color="text.secondary">
					No projects yet. A project appears here once its folder exists in the design repository.
				</FSTypography>
			)}

			{projects.map((project) => (
				<FSBox key={project.id} sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 2 }}>
					<FSStack spacing={1}>
						<FSStack direction="row" alignItems="center" spacing={1} flexWrap="wrap">
							<FSTypography variant="subtitle1">{project.title}</FSTypography>
							<FSTypography variant="body2" color="text.secondary">
								{project.id}
							</FSTypography>
							{startedAt(project) && (
								<FSTypography variant="body2" color="text.secondary">
									· Started {new Date(startedAt(project) as string).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
								</FSTypography>
							)}
							<FSBox flexGrow={1} />
							{project.localOnly && <FSChip variant="status" size="small" label="Only on this machine" />}
							{project.openComments > 0 && (
								<FSChip
									variant="status"
									size="small"
									color="warning"
									label={`${project.openComments} comment${project.openComments === 1 ? '' : 's'}`}
								/>
							)}
						</FSStack>

						<People people={project.people} empty="No contributors recorded yet" />

						<FSTypography variant="body2" color="text.secondary">
							{project.records.join(' · ') || 'no records yet'}
						</FSTypography>

						{project.iterations.length === 0 ? (
							<FSTypography variant="body2" color="text.secondary">
								No branches yet.
							</FSTypography>
						) : (
							<FSStack direction="row" spacing={1} flexWrap="wrap">
								{project.iterations.map((iteration) => (
									<FSButton size="md"
										key={iteration.branch}
										variant="secondary"
										onClick={() => setSelected({ project, iteration })}
									>
										{iteration.name}
										{iteration.localOnly && !project.localOnly ? ' · local' : ''}
									</FSButton>
								))}
							</FSStack>
						)}
					</FSStack>
				</FSBox>
			))}
		</FSStack>
	);
};
