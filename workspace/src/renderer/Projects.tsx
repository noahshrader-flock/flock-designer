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
import type { Checkout, Person, Project, ProjectIteration } from '../shared/contract';
import { Build } from './Build';
import { NewWork, type Created } from './NewWork';
import { Review } from './Review';
import { avatarUrl } from '../shared/people';

/** Profile picture and username for each person; initials stand in when no GitHub account is known. */
const People = ({ people, empty }: { people: Person[]; empty?: string }) =>
	people.length === 0 ? (
		empty ? (
			<FSTypography variant="body2" color="text.secondary">
				{empty}
			</FSTypography>
		) : null
	) : (
		<FSStack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
			{people.map((p) => (
				<FSStack key={p.login ?? p.name} direction="row" spacing={1} alignItems="center">
					<FSAvatar
						src={avatarUrl(p.login) ?? undefined}
						alt={p.name}
						sx={{ width: 24, height: 24, fontSize: 12 }}
					>
						{p.name.charAt(0).toUpperCase()}
					</FSAvatar>
					<FSTypography variant="body2">{p.login ?? p.name}</FSTypography>
				</FSStack>
			))}
		</FSStack>
	);

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
	const [localUrl, setLocalUrl] = useState<string | null>(null);

	// The checkout is chosen once and remembered.
	useEffect(() => {
		void window.workspace.lastCheckout().then((r) => r.ok && setCheckout(r.value));
	}, []);
	const chooseCheckout = useCallback(async () => {
		const r = await window.workspace.chooseCheckout();
		if (r.ok && r.value) setCheckout(r.value);
	}, []);
	const showPreview = useCallback((url: string) => setLocalUrl(url), []);

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

	if (error) {
		return (
			<FSStack spacing={2}>
				<FSAlert severity="error">{error}</FSAlert>
				<FSBox>
					<FSButton variant="secondary" onClick={load}>
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
				project={selected.project}
				iteration={selected.iteration}
				externalUrl={localUrl}
				build={
					<Build
						key={`${selected.project.id}/${selected.iteration.name}`}
						checkout={checkout}
						onChoose={chooseCheckout}
						project={selected.project}
						iteration={selected.iteration}
						autoTask={selected.task}
						onPreviewUrl={showPreview}
					/>
				}
				header={
					<>
						<FSTypography variant="body2" color="text.secondary">
							{selected.iteration.branch}
						</FSTypography>
						<People people={selected.iteration.contributors} />
					</>
				}
				onBack={() => {
					setSelected(null);
					setLocalUrl(null);
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
				<FSButton variant="secondary" onClick={load}>
					Refresh
				</FSButton>
				<FSButton onClick={() => setCreating(true)}>New prototype</FSButton>
			</FSStack>
			{!checkout && (
				<FSAlert severity="info" action={<FSButton onClick={chooseCheckout}>Choose checkout</FSButton>}>
					Choose your Coke checkout to see work built on this machine alongside everyone else's.
				</FSAlert>
			)}
			<NewWork
				open={creating}
				onClose={() => setCreating(false)}
				checkout={checkout}
				onChoose={chooseCheckout}
				onCreated={(c: Created) => {
					setCreating(false);
					setLocalUrl(null);
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
									<FSButton
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
