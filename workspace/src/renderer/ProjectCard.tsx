import { FileTextIcon, FolderIcon, GitBranchIcon, MessageSquareIcon } from 'lucide-react';
import type { Project, ProjectIteration } from '../shared/contract';
import { workOf } from '../shared/projects';
import { CardCover } from './CardCover';
import { MoreMenu } from './MoreMenu';
import { PeopleLine } from './People';
import { Badge } from './ui/badge';
import { Card, CardContent, CardTitle } from './ui/card';
import { DropdownMenuItem, DropdownMenuSeparator } from './ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

/** A name as it reads in a menu: the first letter capital, the rest as written. */
const sentence = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * A project in the Projects grid. The top is a cover in the card's own colour: the project's menu at its top right (its
 * newest prototype and newest codebase work, when there is any, then its records) and its name at its bottom right.
 * Under it, who the project is by, and what to know at a glance: that it is only on this machine, its open comments, or
 * that nothing is made yet.
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
				{/* Always there, so the name stays at the bottom when there is no menu. */}
				<div className="flex justify-end">
					{(prototype || codebase || project.records.length > 0) && (
						<MoreMenu label={`More for ${project.title}`}>
							{prototype && (
								<DropdownMenuItem onSelect={() => onOpen(prototype)}>
									<FolderIcon />
									View prototype
								</DropdownMenuItem>
							)}
							{codebase && (
								<DropdownMenuItem onSelect={() => onOpen(codebase)}>
									<GitBranchIcon />
									View codebase
								</DropdownMenuItem>
							)}
							{(prototype || codebase) && project.records.length > 0 && <DropdownMenuSeparator />}
							{project.records.map((record) => (
								<DropdownMenuItem key={record} onSelect={() => onViewRecord(record)}>
									<FileTextIcon />
									{sentence(record.replace(/\.[^.]+$/, '').replace(/-/g, ' '))}
								</DropdownMenuItem>
							))}
						</MoreMenu>
					)}
				</div>
				<CardTitle className="line-clamp-2 text-right text-base font-semibold">{project.title}</CardTitle>
			</CardCover>
			<CardContent className="flex items-center justify-between gap-2">
				<PeopleLine people={project.people} />
				<span className="ml-auto flex shrink-0 items-center gap-2">
					{project.iterations.length === 0 && <span className="text-muted-foreground text-sm">Nothing made yet.</span>}
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
			</CardContent>
		</Card>
	);
};
