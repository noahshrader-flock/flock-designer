import { FileTextIcon, FolderIcon, GitBranchIcon, MessageSquareIcon } from 'lucide-react';
import type { Project, ProjectIteration } from '../shared/contract';
import { workOf } from '../shared/projects';
import { CardCover } from './CardCover';
import { MoreMenu } from './MoreMenu';
import { PeopleLine } from './People';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardFooter, CardTitle } from './ui/card';
import { DropdownMenuItem } from './ui/dropdown-menu';

/** A name as it reads in a menu: the first letter capital, the rest as written. */
const sentence = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** One way into each kind of work: a prototype, and codebase work. */
const WAYS_IN = 2;
/** The height of one way in: a ghost button, which a blank place in the footer is made as tall as. */
const WAY_HEIGHT = 'h-8';

/** How many comments are open on this kind of work, across all of its iterations. */
const openIn = (iterations: ProjectIteration[]): number => iterations.reduce((n, it) => n + it.openComments, 0);

/**
 * A project in the Projects grid. The top is a cover in the card's own colour: at its top right the project's menu (its
 * records, when it has any) and across from it whether it is only on this machine; at its bottom left the project's
 * name, with who it is by directly under it. The footer is a stacked list of the ways in: view the newest prototype, and
 * under it the newest codebase work, each only when it exists and each with how many comments are open on that work at
 * its far right. The footer always has room for both, so on every card in a grid it starts at the same line, with a blank
 * place under a way in that is not there, and the cards in a row are the same height.
 */
export const ProjectCard = ({
	project,
	onOpen,
	onViewRecord,
}: {
	project: Project;
	/** One way into each kind of work, at its newest; the review screen switches between its iterations. */
	onOpen: (iteration: ProjectIteration) => void;
	onViewRecord: (name: string) => void;
}) => {
	const prototypes = workOf(project.iterations, 'prototype');
	const codebases = workOf(project.iterations, 'codebase');
	const ways = [
		prototypes[0] && { iteration: prototypes[0], label: 'View prototype', Icon: FolderIcon, comments: openIn(prototypes) },
		codebases[0] && { iteration: codebases[0], label: 'View codebase', Icon: GitBranchIcon, comments: openIn(codebases) },
	].filter((way) => way !== undefined);
	return (
		<Card className="pt-0">
			<CardCover>
				{/* Always there, so the name stays at the bottom when there is nothing to put at the top. */}
				<div className="flex items-start justify-between gap-2">
					<span className="flex flex-wrap items-center gap-2">{project.localOnly && <Badge variant="secondary">Only on this machine</Badge>}</span>
					{project.records.length > 0 && (
						<MoreMenu label={`More for ${project.title}`}>
							{project.records.map((record) => (
								<DropdownMenuItem key={record} onSelect={() => onViewRecord(record)}>
									<FileTextIcon />
									{sentence(record.replace(/\.[^.]+$/, '').replace(/-/g, ' '))}
								</DropdownMenuItem>
							))}
						</MoreMenu>
					)}
				</div>
				<div className="flex min-w-0 flex-col gap-1">
					<CardTitle className="line-clamp-2 text-base font-semibold">{project.title}</CardTitle>
					<PeopleLine people={project.people} />
				</div>
			</CardCover>
			<CardFooter className="mt-auto flex-col items-stretch gap-0.5 p-2">
				{ways.map(({ iteration, label, Icon, comments }) => (
					<Button key={label} variant="ghost" className="justify-start" onClick={() => onOpen(iteration)}>
						<Icon />
						{label}
						{comments > 0 && (
							<span className="text-muted-foreground ml-auto flex items-center gap-1 text-xs" aria-label={`${comments} open comment${comments === 1 ? '' : 's'}`}>
								<MessageSquareIcon className="size-3.5" />
								{comments}
							</span>
						)}
					</Button>
				))}
				{ways.length === 0 && <span className={`text-muted-foreground flex items-center px-2 text-sm ${WAY_HEIGHT}`}>Nothing made yet.</span>}
				{Array.from({ length: WAYS_IN - Math.max(ways.length, 1) }, (_, blank) => (
					<span key={blank} aria-hidden className={WAY_HEIGHT} />
				))}
			</CardFooter>
		</Card>
	);
};
