import { CircleCheckIcon, EllipsisVerticalIcon, RotateCcwIcon, Trash2Icon } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import type { MarkerState, ReviewComment } from '../../shared/contract';
import { stateOfQuery } from '../../shared/prototypeStates';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '../ui/dropdown-menu';
import type { Comments } from './useComments';

/** What a card says about where its pin is, when that is worth saying. */
const NOTE: Record<MarkerState, string | null> = {
	found: null,
	moved: 'The element changed, so this follows its text.',
	missing: 'The element is no longer on the page, so this is shown as a page comment.',
	elsewhere: null,
	otherState: 'Made in a different state of this page. Switch to that state to see where it was.',
};

/**
 * Every comment on the iteration, as cards: who wrote it, what it says, the spot it was made on, and a menu to resolve
 * or delete it. `actions` puts more at the top of a card's menu (the app's Address), and `addressed` says on a card
 * what the agent did with it, both left to the screen this sits in. `states` are the prototype's, so a card can name
 * the state it was made in.
 */
export const CommentList = ({
	comments,
	actions,
	addressed,
	states = [],
}: {
	comments: Comments;
	actions?: (comment: ReviewComment) => ReactNode;
	addressed?: (comment: ReviewComment) => ReactNode;
	states?: string[];
}) => {
	// Deleting cannot be undone, so it asks first, on the card itself (a dialog would have to take the preview's place).
	const [confirmingDelete, setConfirmingDelete] = useState<number | null>(null);
	const list = comments.comments;
	if (list?.length === 0) return <p className="text-muted-foreground text-sm">No comments yet. Choose Comment, then click anywhere on the page.</p>;
	return (
		<>
			{list?.map((comment) => {
				// A resolved comment is not drawn on the page at all, so whatever was last said about placing it ("the
				// element is no longer there") is about a pin that no longer exists, and saying it again would be about
				// nothing. One the agent addressed is resolved with it, so this covers that too.
				const state = comment.resolved ? undefined : comments.placed.get(comment.id);
				const n = comments.numberOf(comment.id);
				const note = comment.addressedAt !== null ? addressed?.(comment) : null;
				const madeIn = comment.anchor?.state === undefined ? null : stateOfQuery(comment.anchor.state, states);
				return (
					<div
						key={comment.id}
						ref={(el: HTMLDivElement | null) => comments.registerCard(comment.id, el)}
						onClick={() => comments.select(comment)}
						className={`rounded-lg border p-3 ${comments.selected === comment.id ? 'border-primary bg-accent border-2' : ''} ${
							comment.anchor ? 'cursor-pointer' : ''
						} ${comment.resolved ? 'opacity-65' : ''}`}
					>
						<div className="flex flex-col gap-1.5">
							<div className="flex flex-row items-center gap-2">
								{n > 0 && <Badge variant="secondary">{n}</Badge>}
								<span className="min-w-0 truncate text-sm font-medium">{comment.author}</span>
								{comment.resolved && <Badge variant="success">Resolved</Badge>}
								<DropdownMenu>
									<DropdownMenuTrigger asChild>
										<Button
											size="icon-sm"
											variant="ghost"
											aria-label="Comment actions"
											className="-my-1 -mr-1.5 ml-auto"
											onClick={(e: React.MouseEvent) => e.stopPropagation()}
										>
											<EllipsisVerticalIcon />
										</Button>
									</DropdownMenuTrigger>
									{/* The menu is drawn outside the card but its clicks still reach the card in React: they must not select it. */}
									<DropdownMenuContent align="end" className="w-auto" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
										{actions?.(comment)}
										<DropdownMenuItem onSelect={() => void comments.resolve(comment, !comment.resolved)}>
											{comment.resolved ? <RotateCcwIcon /> : <CircleCheckIcon />}
											{comment.resolved ? 'Reopen' : 'Resolve'}
										</DropdownMenuItem>
										<DropdownMenuSeparator />
										<DropdownMenuItem variant="destructive" onSelect={() => setConfirmingDelete(comment.id)}>
											<Trash2Icon />
											Delete
										</DropdownMenuItem>
									</DropdownMenuContent>
								</DropdownMenu>
							</div>
							{note && <p className="text-muted-foreground text-xs">{note}</p>}
							{confirmingDelete === comment.id && (
								<div className="flex flex-row items-center gap-2" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
									<span className="text-destructive grow text-xs">Delete this comment for good? It cannot be brought back.</span>
									<Button size="sm" variant="ghost" onClick={() => setConfirmingDelete(null)}>
										Keep
									</Button>
									<Button
										size="sm"
										variant="destructive"
										onClick={() => void comments.remove(comment).then((gone) => gone && setConfirmingDelete(null))}
									>
										Delete
									</Button>
								</div>
							)}
							<p className="text-sm">{comment.body}</p>
							{comment.picture && <img className="max-w-[240px] rounded border" src={comment.picture} alt={`The spot comment ${n || ''} was made on`} />}
							{madeIn && <span className="text-muted-foreground text-xs">State: {madeIn}</span>}
							{comment.anchor && state === 'elsewhere' && <span className="text-muted-foreground text-xs">On {comment.anchor.route}</span>}
							{state && NOTE[state] && <span className="text-warning text-xs">{NOTE[state]}</span>}
						</div>
					</div>
				);
			})}
		</>
	);
};
