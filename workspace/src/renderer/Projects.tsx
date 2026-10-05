import {
	FSAlert,
	FSBox,
	FSButton,
	FSChip,
	FSStack,
	FSTextField,
	FSTypography,
} from '@flocksafety/flock-react-component-lib';
import { useCallback, useEffect, useState } from 'react';
import type { Project, ProjectIteration, ReviewComment } from '../shared/contract';

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
			<Iteration
				project={selected.project}
				iteration={selected.iteration}
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

/** One iteration's comment thread. C2 adds the preview and element anchoring. */
const Iteration = ({
	project,
	iteration,
	onBack,
}: {
	project: Project;
	iteration: ProjectIteration;
	onBack: () => void;
}) => {
	const [comments, setComments] = useState<ReviewComment[] | null>(null);
	const [draft, setDraft] = useState('');
	const [error, setError] = useState<string | null>(null);
	const [posting, setPosting] = useState(false);

	const load = useCallback(async () => {
		const result = await window.workspace.readComments(project.id, iteration.branch);
		if (result.ok) {
			setComments(result.value);
		} else {
			setError(result.error);
		}
	}, [project.id, iteration.branch]);

	useEffect(() => {
		void load();
	}, [load]);

	const post = async () => {
		if (!draft.trim()) return;
		setPosting(true);
		const result = await window.workspace.postComment(project.id, iteration.branch, draft.trim());
		setPosting(false);
		if (result.ok) {
			setDraft('');
			await load();
		} else {
			setError(result.error);
		}
	};

	return (
		<FSStack spacing={2}>
			<FSStack direction="row" alignItems="center" spacing={2}>
				<FSButton variant="secondary" onClick={onBack}>
					Back
				</FSButton>
				<FSTypography variant="h6" component="h2">
					{project.title} — {iteration.name}
				</FSTypography>
			</FSStack>
			<FSTypography variant="body2" color="text.secondary">
				{iteration.branch}
			</FSTypography>

			{error && <FSAlert severity="error">{error}</FSAlert>}

			{comments?.length === 0 && (
				<FSTypography variant="body2" color="text.secondary">
					No comments yet.
				</FSTypography>
			)}

			{comments?.map((comment) => (
				<FSBox key={comment.id} sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 2 }}>
					<FSStack spacing={0.5}>
						<FSStack direction="row" spacing={1} alignItems="center">
							<FSTypography variant="subtitle2">{comment.author}</FSTypography>
							{comment.resolved && <FSChip variant="status" size="small" color="success" label="Resolved" />}
						</FSStack>
						<FSTypography variant="body2">{comment.body}</FSTypography>
					</FSStack>
				</FSBox>
			))}

			<FSStack direction="row" spacing={2} alignItems="flex-start">
				<FSTextField
					label="Add a comment"
					multiline
					minRows={2}
					value={draft}
					onChange={setDraft}
					sx={{ flexGrow: 1 }}
				/>
				<FSButton onClick={post} disabled={posting || !draft.trim()}>
					{posting ? 'Posting…' : 'Comment'}
				</FSButton>
			</FSStack>
		</FSStack>
	);
};
