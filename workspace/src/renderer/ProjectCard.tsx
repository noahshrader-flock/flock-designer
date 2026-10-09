import { ExternalLinkIcon, MessageSquareIcon } from 'lucide-react';
import type { KeyboardEvent, ReactNode } from 'react';
import type { Project, ProjectIteration } from '../shared/contract';
import { plural } from '../shared/plural';
import { byVersion, projectCodeLink, workOf } from '../shared/projects';
import { CardCover } from './CardCover';
import { PeopleLine } from './People';
import { Badge } from './ui/badge';
import { Card, CardFooter, CardTitle } from './ui/card';

/** How many comments a project's prototypes have, all of them together. */
const commentsOn = (prototypes: ProjectIteration[]): number => prototypes.reduce((n, it) => n + it.openComments, 0);

/** What the footer says at its right, in the grey of the comment count. */
const Aside = ({ children }: { children: ReactNode }) => <span className="text-muted-foreground flex shrink-0 items-center gap-1.5 text-sm">{children}</span>;

/**
 * A project in the Projects grid. The cover, in the card's own colour, has the project's name at its bottom left (and at
 * its top whether it is only on this machine). The footer has who it is by at the left and, at the right in grey, how
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
	const way =
		go === null
			? {}
			: {
					role: newest ? 'button' : 'link',
					tabIndex: 0,
					'aria-label': newest ? `Open ${project.title}` : `Open ${project.title} on GitHub`,
					onClick: go,
					onKeyDown: (e: KeyboardEvent) => {
						if (e.key !== 'Enter' && e.key !== ' ') return;
						e.preventDefault();
						go();
					},
				};
	return (
		<Card
			className={`pt-0 ${go ? 'hover:bg-accent/40 focus-visible:ring-ring/50 cursor-pointer transition-colors outline-none focus-visible:ring-3' : ''}`}
			{...way}
		>
			<CardCover>
				{/* Always there, so the name stays at the bottom when there is nothing to put at the top. */}
				<div className="flex items-start justify-between gap-2">
					<span className="flex flex-wrap items-center gap-2">{project.localOnly && <Badge variant="secondary">Only on this machine</Badge>}</span>
					{!newest && link && <ExternalLinkIcon aria-hidden className="text-muted-foreground size-4 shrink-0" />}
				</div>
				<CardTitle className="line-clamp-2 text-lg font-semibold">{project.title}</CardTitle>
			</CardCover>
			<CardFooter className="mt-auto flex h-12 items-center justify-between gap-2 pr-3 pl-4.5">
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
			</CardFooter>
		</Card>
	);
};
