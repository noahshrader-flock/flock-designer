import { ExternalLinkIcon, MessageSquareIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Project, ProjectIteration } from '../shared/contract';
import { plural } from '../shared/plural';
import { byVersion, projectCodeLink, workOf } from '../shared/projects';
import { CardCover } from './CardCover';
import { PROJECT_FOOTER } from './cardFooters';
import { PRESSABLE_CARD, pressableCard } from './pressableCard';
import { PeopleLine } from './People';
import { Badge } from './ui/badge';
import { Card, CardFooter, CardTitle } from './ui/card';

/** How many comments a project's prototypes have, all of them together. */
const commentsOn = (prototypes: ProjectIteration[]): number => prototypes.reduce((n, it) => n + it.openComments, 0);

/** What the footer says at its right, in the gray of the comment count. */
const Aside = ({ children }: { children: ReactNode }) => <span className="text-muted-foreground flex shrink-0 items-center gap-1.5 text-sm">{children}</span>;

/**
 * A project in the Projects grid, shaped as a component's is (`ComponentCard`): the cover is the preview, empty for now in
 * the soft color of a component with no picture, with whether the project is only on this machine at its top left. The
 * footer has the project's name on a row of its own, and under it who it is by at the left and, at the right in gray, how
 * many versions the project has and how many comments its prototypes have (or Built in code, or Nothing made yet). It is
 * the same height on every card, so a row of cards lines up.
 *
 * **The whole card opens the project at its newest prototype**, which is the app's work: it is for prototypes. A project
 * with only codebase work is not opened here (that work is done in the codebase): its footer says Built in code, and the
 * whole card opens it on GitHub in the browser, for anyone with access, whether or not they have the repository, with
 * the external-link icon at the card's top right to say it leaves the app.
 */
export const ProjectCard = ({ project, onOpen }: { project: Project; onOpen: (iteration: ProjectIteration) => void }) => {
	const prototypes = workOf(project.iterations, 'prototype');
	const newest = prototypes[0];
	const codebase = workOf(project.iterations, 'codebase').length > 0;
	const link = projectCodeLink(project);
	const comments = commentsOn(prototypes);
	// Different ideas, not the iterations in each: V1 · I1 and V1 · I2 are one version.
	const versions = byVersion(prototypes).length;
	// What pressing the card does: into the newest prototype, or out to the codebase work on GitHub. Or nothing.
	const go = newest !== undefined ? () => onOpen(newest) : link !== null ? () => void window.open(link, '_blank', 'noreferrer') : null;
	const way = go === null ? {} : pressableCard(newest ? `Open ${project.title}` : `Open ${project.title} on GitHub`, go, newest ? 'button' : 'link');
	return (
		<Card className={`pt-0 ${go ? PRESSABLE_CARD : ''}`} {...way}>
			{/* The preview, when there is one: it fills the cover, as a component's picture does. */}
			<CardCover>
				<div data-preview-area className="bg-muted/40 absolute inset-0" />
				{project.localOnly && (
					<Badge variant="secondary" className="absolute top-2 left-2 z-10">
						Only on this machine
					</Badge>
				)}
				{!newest && link && <ExternalLinkIcon aria-hidden className="text-muted-foreground absolute top-2 right-2 z-10 size-4" />}
			</CardCover>
			<CardFooter className={PROJECT_FOOTER}>
				<CardTitle className="shrink-0 truncate text-sm font-semibold">{project.title}</CardTitle>
				<div className="flex items-center justify-between gap-2">
					{project.people.length > 0 ? <PeopleLine people={project.people} /> : <span />}
					{newest ? (
						<Aside>
							<span>{plural(versions, 'version')}</span>
							<span aria-hidden>•</span>
							<span className="flex items-center gap-1" aria-label={plural(comments, 'comment')}>
								<MessageSquareIcon className="size-3.5" />
								{comments}
							</span>
						</Aside>
					) : codebase ? (
						<Aside>Built in code</Aside>
					) : (
						<Aside>Nothing made yet</Aside>
					)}
				</div>
			</CardFooter>
		</Card>
	);
};
