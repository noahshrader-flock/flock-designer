import { WandSparklesIcon } from 'lucide-react';
import { commentRef } from '../../shared/comments';
import type { Checkout, Project, ProjectIteration } from '../../shared/contract';
import { prototypeKey } from '../../shared/designPaths';
import { iterationLabel } from '../../shared/work';
import { prototypeAddressed } from '../comments/addressed';
import type { useComments } from '../comments/useComments';
import { Alert, AlertDescription } from '../ui/alert';
import { DropdownMenuItem } from '../ui/dropdown-menu';
import type { AddressState } from './useAddress';
import { ErrorAlert } from '../ErrorAlert';
import { InlineAction } from '../Links';
import { AgentLog } from '../Loading';
import { CommentsPanel } from '../comments/CommentsPanel';

/**
 * The review screen's comments panel (`CommentsPanel`), with what this screen adds: a route that did not load, where an
 * Address run has got to, and Address on each comment when the agent can run here.
 */
export const CommentsSidebar = ({
	comments,
	error,
	wrongRoute,
	address: { address, log, addressing, addressComment, changedElsewhere, openChanged },
	prototype,
	states,
	onShowState,
	checkout,
	project,
	iteration,
}: {
	comments: ReturnType<typeof useComments>;
	error: string | null;
	wrongRoute: { asked: string; landedOn: string } | null;
	address: AddressState;
	prototype: boolean;
	states: string[];
	onShowState: (state: string | null) => void;
	checkout: Checkout | null;
	project: Project;
	iteration: ProjectIteration;
}) => {
	const composing = comments.composing;
	/** A prototype iteration of this project, by name, as people read it. */
	const labelOf = (name: string): string => iterationLabel({ name, branch: prototypeKey(project.id, name) });
	return (
		<CommentsPanel
			comments={comments}
			error={error}
			// Dragging the divider hides the preview for the drag: the pointer over a native view never reaches this window.
			onResizing={(r) => void window.workspace.pageHold('resize', r)}
			states={states}
			onShowState={onShowState}
			actions={(comment) =>
				// The agent runs on this machine, against the product repository: without it there is nothing to build with.
				!comment.resolved && checkout ? (
					<DropdownMenuItem disabled={address.kind === 'running'} onSelect={() => void addressComment(commentRef(comment))}>
						<WandSparklesIcon />
						{addressing === comment.id && address.kind === 'running' ? 'Working…' : 'Address'}
					</DropdownMenuItem>
				) : null
			}
			addressed={(comment) =>
				// A prototype's version is a hash of its source, which means nothing to a person; a commit does.
				prototype ? (
					prototypeAddressed(comment, project.id, iteration.name)
				) : (
					<>
						The agent addressed this in <code>{comment.addressedAt?.slice(0, 7)}</code>
					</>
				)
			}
		>
			{/* The recorded route did not load. Said once, plainly: the page on screen is not the work, so a comment made
				    here would be about something this iteration never touched. */}
			{wrongRoute && !composing && (
				<Alert variant="warning">
					<AlertDescription>
						This iteration records its work at <code>{wrongRoute.asked}</code>, but the preview opened <code>{wrongRoute.landedOn}</code>. The page
						you are looking at may not be the work. The route may have moved, or something redirected it.
					</AlertDescription>
				</Alert>
			)}
			{address.kind === 'running' && (
				<>
					<p className="text-muted-foreground text-xs">
						{prototype
							? 'The agent is working on that comment. The page is rebuilt and saved when it finishes.'
							: 'The agent is working on that comment. The preview updates as it changes the code.'}
					</p>
					<AgentLog lines={log.slice(-8)} size="sm" />
				</>
			)}
			{address.kind === 'done' && (
				<Alert variant={address.changed ? 'success' : 'default'}>
					<AlertDescription>
						{changedElsewhere ? (
							<>
								Others had commented on {iterationLabel(iteration)}, so it stays as they saw it. The change is in{' '}
								{labelOf(changedElsewhere.iteration)}. <InlineAction onClick={openChanged}>Open {labelOf(changedElsewhere.iteration)}</InlineAction>
							</>
						) : address.changed ? (
							'The agent has finished. Look at the preview and the changes, then resolve what is done.'
						) : (
							'The agent finished without changing anything. What it says below is why — often the change is outside this iteration, or the comment needs a decision from you.'
						)}
						{/* When nothing changed, what it said is the whole answer, so less of it is cut. */}
						<AgentLog lines={log.slice(address.changed ? -25 : -60)} size={address.changed ? 'md' : 'lg'} className="mt-2" />
					</AlertDescription>
				</Alert>
			)}
			{address.kind === 'failed' && <ErrorAlert error={address.message} />}
		</CommentsPanel>
	);
};
