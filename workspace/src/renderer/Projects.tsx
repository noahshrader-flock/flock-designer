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
import type { Person, Project, ProjectIteration } from '../shared/contract';
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
	const [selected, setSelected] = useState<{ project: Project; iteration: ProjectIteration } | null>(null);

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
			</FSStack>

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
