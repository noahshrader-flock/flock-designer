import type { Project, ProjectIteration } from '../shared/contract';
import { ListRow } from './ListRow';
import { PeopleLine } from './People';
import { FolderBadge, ProjectAside, openingOf } from './ProjectParts';
import { useCover } from './useCover';
import { Badge } from './ui/badge';

/**
 * A project in the Projects list, the row of its card (`ProjectCard`): its picture reduced, its name with who it is by
 * under it, and what it has at the right (`ProjectAside`). The whole row is the way in the card has: into its newest
 * prototype, or out to its codebase work on GitHub with the external-link icon; a project with nothing to open is a row
 * with its button off. Its folder, and whether it is only on this machine, are said beside the name, where the card says
 * them on its cover.
 */
export const ProjectRow = ({ project, onOpen }: { project: Project; onOpen: (iteration: ProjectIteration) => void }) => {
	const cover = useCover(project);
	const opening = openingOf(project, onOpen);
	return (
		<ListRow
			data={{ 'data-project': project.id }}
			name={
				<span className="flex min-w-0 items-center gap-2">
					<span className="truncate">{project.title}</span>
					<FolderBadge project={project} />
					{project.localOnly && <Badge variant="secondary">Only on this machine</Badge>}
				</span>
			}
			detail={project.people.length > 0 ? <PeopleLine people={project.people} /> : undefined}
			aside={<ProjectAside project={project} />}
			picture={cover.picture}
			drawing={cover.waiting}
			onOpen={opening?.press ?? null}
			label={opening?.label}
			external={opening?.role === 'link'}
		/>
	);
};
