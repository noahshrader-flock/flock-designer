import { ExternalLinkIcon, MessageSquareIcon } from 'lucide-react';
import type { KeyboardEvent, ReactNode } from 'react';
import type { Project, ProjectIteration } from '../shared/contract';
import { codeLink, workOf } from '../shared/projects';
import { CardCover } from './CardCover';
import { PeopleLine } from './People';
import { Badge } from './ui/badge';
import { Card, CardFooter, CardTitle } from './ui/card';

/** How many comments a project's prototypes have, all of them together. */
const commentsOn = (prototypes: ProjectIteration[]): number => prototypes.reduce((n, it) => n + it.openComments, 0);

/** What the footer says at its right when there is no prototype to count comments on. */
const Aside = ({ children }: { children: ReactNode }) => <span className="text-muted-foreground flex shrink-0 items-center gap-1.5 text-sm">{children}</span>;

/**
 * A project in the Projects grid. The cover, in the card's own colour, has the project's name at its bottom left (and at
 * its top whether it is only on this machine). The footer has who it is by at the left and how many comments its
 * prototypes have at the right, and is the same height on every card, so a row of cards lines up.
 *
 * **The whole card opens the project at its newest prototype**, which is the app's work: it is for prototypes. A project
 * with only codebase work is not opened here (that work is done in the codebase); its footer links to it on GitHub, for
 * anyone with access, whether or not they have the repository.
 */
export const ProjectCard = ({ project, onOpen }: { project: Project; onOpen: (iteration: ProjectIteration) => void }) => {
	const prototypes = workOf(project.iterations, 'prototype');
	const newest = prototypes[0];
	const codebase = workOf(project.iterations, 'codebase')[0];
	const link = codebase ? codeLink(codebase) : null;
	const comments = commentsOn(prototypes);
	const way =
		newest === undefined
			? {}
			: {
					role: 'button',
					tabIndex: 0,
					'aria-label': `Open ${project.title}`,
					onClick: () => onOpen(newest),
					onKeyDown: (e: KeyboardEvent) => {
						if (e.key !== 'Enter' && e.key !== ' ') return;
						e.preventDefault();
						onOpen(newest);
					},
				};
	return (
		<Card
			className={`pt-0 ${newest ? 'hover:bg-accent/40 focus-visible:ring-ring/50 cursor-pointer transition-colors outline-none focus-visible:ring-3' : ''}`}
			{...way}
		>
			<CardCover>
				{/* Always there, so the name stays at the bottom when there is nothing to put at the top. */}
				<div className="flex flex-wrap items-center gap-2">{project.localOnly && <Badge variant="secondary">Only on this machine</Badge>}</div>
				<CardTitle className="line-clamp-2 text-lg font-semibold">{project.title}</CardTitle>
			</CardCover>
			<CardFooter className="mt-auto flex h-12 items-center justify-between gap-2 pr-3 pl-4.5">
				{project.people.length > 0 ? <PeopleLine people={project.people} /> : <span />}
				{newest ? (
					<span className="text-muted-foreground flex shrink-0 items-center gap-1 text-sm" aria-label={`${comments} comment${comments === 1 ? '' : 's'}`}>
						<MessageSquareIcon className="size-3.5" />
						{comments}
					</span>
				) : link ? (
					<a className="text-primary flex shrink-0 items-center gap-1.5 text-sm underline-offset-4 hover:underline" href={link} target="_blank" rel="noreferrer">
						<ExternalLinkIcon className="size-3.5" />
						Built in code
					</a>
				) : codebase ? (
					<Aside>Built in code</Aside>
				) : (
					<Aside>Nothing made yet</Aside>
				)}
			</CardFooter>
		</Card>
	);
};
