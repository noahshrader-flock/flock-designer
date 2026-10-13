import { MessageSquareIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Project, ProjectIteration } from '../shared/contract';
import { plural } from '../shared/plural';
import { projectOpening } from '../shared/projectList';
import { byVersion } from '../shared/prototypeNames';
import { workOf } from '../shared/work';
import { CARD_DETAIL } from './cardFooters';
import { Badge } from './ui/badge';
import { cn } from '@/lib/utils';

/**
 * What a project's card and its row in the list have in common, so neither says it twice: its picture, what it has (its
 * versions and comments), its folder, and what pressing it does.
 */

/** How many comments a project's prototypes have, all of them together. */
const commentsOn = (prototypes: ProjectIteration[]): number => prototypes.reduce((n, it) => n + it.openComments, 0);

/** What a card's footer and a row say at their right, in the gray of the details. */
const Aside = ({ children }: { children: ReactNode }) => <span className={cn(CARD_DETAIL, 'flex shrink-0 items-center gap-1.5')}>{children}</span>;

/**
 * What a project has, at the right: how many versions and how many comments its prototypes have; or Built in code; or
 * Nothing made yet. Versions are different ideas, not the iterations in each (V1 · I1 and V1 · I2 are one version).
 */
export const ProjectAside = ({ project }: { project: Project }) => {
	const prototypes = workOf(project.iterations, 'prototype');
	if (prototypes.length > 0) {
		const comments = commentsOn(prototypes);
		return (
			<Aside>
				<span>{plural(byVersion(prototypes).length, 'version')}</span>
				<span aria-hidden>•</span>
				<span className="flex items-center gap-1" aria-label={plural(comments, 'comment')}>
					<MessageSquareIcon className="size-3.5" />
					{comments}
				</span>
			</Aside>
		);
	}
	return <Aside>{workOf(project.iterations, 'codebase').length > 0 ? 'Built in code' : 'Nothing made yet'}</Aside>;
};

/**
 * What pressing a project does (`projectOpening`), ready to press: its words for a screen reader, whether it is a button
 * (into the app) or a link (out to GitHub), and the press. Null when there is nothing to open.
 */
export const openingOf = (project: Project, onOpen: (iteration: ProjectIteration) => void) => {
	const opening = projectOpening(project);
	if (opening === null) return null;
	return {
		label: opening.label,
		role: opening.kind === 'app' ? ('button' as const) : ('link' as const),
		press: opening.kind === 'app' ? () => onOpen(opening.iteration) : () => void window.open(opening.url, '_blank', 'noreferrer'),
	};
};

/** The folder a project is in, said quietly where its card and its row say it is only on this machine; nothing for none. */
export const FolderBadge = ({ project, className }: { project: Project; className?: string }) =>
	project.folder ? (
		<Badge variant="outline" data-folder className={className}>
			{project.folder}
		</Badge>
	) : null;
