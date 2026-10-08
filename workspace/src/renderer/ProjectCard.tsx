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
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

/** A name as it reads in a menu: the first letter capital, the rest as written. */
const sentence = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * A project in the Projects grid. The top is a cover in the card's own colour: at its top right the project's menu (its
 * records, when it has any) and across from it what to know at a glance (only on this machine, open comments); at its
 * bottom left the project's name, with who it is by directly under it. The footer is a stacked list of the ways in: view
 * the newest prototype, and under it the newest codebase work, each only when it exists, or that nothing is made yet.
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
	const prototype = workOf(project.iterations, 'prototype')[0];
	const codebase = workOf(project.iterations, 'codebase')[0];
	const comments = `${project.openComments} open comment${project.openComments === 1 ? '' : 's'}`;
	return (
		<Card className="pt-0">
			<CardCover>
				{/* Always there, so the name stays at the bottom when there is nothing to put at the top. */}
				<div className="flex items-start justify-between gap-2">
					<span className="flex flex-wrap items-center gap-2">
						{project.localOnly && <Badge variant="secondary">Only on this machine</Badge>}
						{project.openComments > 0 && (
							<Tooltip>
								<TooltipTrigger asChild>
									<Badge variant="secondary" aria-label={comments}>
										<MessageSquareIcon />
										{project.openComments}
									</Badge>
								</TooltipTrigger>
								<TooltipContent>{comments}</TooltipContent>
							</Tooltip>
						)}
					</span>
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
				{project.iterations.length === 0 && <span className="text-muted-foreground px-2 py-1 text-sm">Nothing made yet.</span>}
				{prototype && (
					<Button variant="ghost" className="justify-start" onClick={() => onOpen(prototype)}>
						<FolderIcon />
						View prototype
					</Button>
				)}
				{codebase && (
					<Button variant="ghost" className="justify-start" onClick={() => onOpen(codebase)}>
						<GitBranchIcon />
						View codebase
					</Button>
				)}
			</CardFooter>
		</Card>
	);
};
