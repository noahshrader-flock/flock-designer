import { CircleCheckIcon, RotateCcwIcon, Trash2Icon } from 'lucide-react';
import { type MouseEvent as ClickEvent, type ReactNode, useState } from 'react';
import type { MarkerState, ReviewComment } from '../../shared/contract';
import { stateLabel, stateOfQuery } from '../../shared/prototypeStates';
import type { ShownTheme } from '../useShownTheme';
import { themeLabel } from '../../shared/prototypeTheme';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { DropdownMenuItem, DropdownMenuSeparator } from '../ui/dropdown-menu';
import type { Comments } from './useComments';
import { cn } from '@/lib/utils';
import { Item } from '../ui/item';
import { MoreMenu } from '../MoreMenu';
import { Person } from '../Person';

/** What a card says about where its pin is, when that is worth saying. */
const NOTE: Record<MarkerState, string | null> = {
	found: null,
	moved: 'The element changed, so this follows its text.',
	missing: 'The element is no longer on the page, so this is shown as a page comment.',
	elsewhere: null,
	otherState: 'Made in a different state of this page, so it is not pinned here.',
};

/**
 * Every comment on the iteration, as cards: who wrote it, what it says, the spot it was made on, and a menu to resolve
 * or delete it. `actions` puts more at the top of a card's menu (the app's Address), and `addressed` says on a card
 * what the agent did with it, both left to the screen this sits in. `states` are the prototype's, so a card can name
 * the state it was made in; `onShowState` opens the page in it (`null` is the first), from a comment made in another.
 * `shownTheme` is the theme the page is shown in: a comment seen in the other one has a button to show the page in that.
 */
export const CommentList = ({
	comments,
	actions,
	addressed,
	states = [],
	onShowState,
	shownTheme,
}: {
	comments: Comments;
	actions?: (comment: ReviewComment) => ReactNode;
	addressed?: (comment: ReviewComment) => ReactNode;
	states?: string[];
	onShowState?: (state: string | null) => void;
	shownTheme?: ShownTheme;
}) => {
	// Deleting cannot be undone, so it asks first, on the card itself (a dialog would have to take the preview's place).
	const [confirmingDelete, setConfirmingDelete] = useState<number | null>(null);
	// The newest at the top, as a conversation reads; each keeps its number (`numberComments`), which is the order made.
	const list = comments.comments && [...comments.comments].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
	if (list?.length === 0)
		return (
			<p className="text-muted-foreground text-sm">No comments yet. Choose Comment and click on the page, or write one below for the whole page.</p>
		);
	return (
		<>
			{list?.map((comment) => {
				// A resolved comment is not drawn on the page at all, so whatever was last said about placing it ("the
				// element is no longer there") is about a pin that no longer exists, and saying it again would be about
				// nothing. One the agent addressed is resolved with it, so this covers that too.
				const state = comment.resolved ? undefined : comments.placed.get(comment.id);
				// Choosing a card shows its pin, so only one with a pin on the page can be chosen: not a resolved one, which has none,
				// nor one with nothing to point at here (page-level, gone, on another page or in another state).
				const choosable = state === 'found' || state === 'moved';
				const note = comment.addressedAt !== null ? addressed?.(comment) : null;
				const madeIn = comment.anchor?.state === undefined ? null : stateOfQuery(comment.anchor.state, states);
				// Made in another of the prototype's states, which it still has: the page can be shown in it.
				const target = madeIn ?? states[0];
				const showIn = state === 'otherState' && onShowState && target !== undefined && states.includes(target) ? target : null;
				// Seen in the other theme: the page can be shown in it, so a problem seen only in dark is seen again.
				const seenIn = comment.anchor?.theme;
				const showTheme = shownTheme && seenIn && seenIn !== shownTheme.theme ? seenIn : null;
				return (
					<Item
						key={comment.id}
						variant="outline"
						ref={(el: HTMLDivElement | null) => comments.registerCard(comment.id, el)}
						// The selected one stands out as the pin on the page does (the same one-pixel border, in the text's own colour); a
						// resolved one recedes. A choosable card is chosen by pressing anywhere on it but the buttons and menu on it.
						className={cn(
							'block p-3',
							choosable && 'hover:bg-accent/50 cursor-pointer transition-colors',
							comments.selected === comment.id && 'border-foreground bg-accent',
							comment.resolved && 'opacity-65',
						)}
						{...(choosable
							? {
									onClick: (e: ClickEvent) => {
										if (!(e.target as HTMLElement).closest('button, a, input, textarea, [role="menu"], [role="menuitem"]')) comments.select(comment);
									},
								}
							: {})}
					>
						<div className="flex flex-col gap-1.5">
							<div className="flex flex-row items-center gap-2">
								<Person name={comment.author} src={comment.authorAvatarUrl} size="xs" />
								<span className="min-w-0 truncate text-sm font-medium">{comment.author}</span>
								{comment.resolved && <Badge variant="success">Resolved</Badge>}
								<MoreMenu label="Comment actions" size="icon-sm" className="-my-1 -mr-1.5 ml-auto">
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
								</MoreMenu>
							</div>
							{note && <p className="text-muted-foreground text-xs">{note}</p>}
							{confirmingDelete === comment.id && (
								<div className="flex flex-row items-center gap-2">
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
							{/* Choosing a comment shows its pin: anywhere on its card with a pointer, and by its own text, a button, for the keyboard. */}
							{choosable ? (
								<button
									type="button"
									aria-current={comments.selected === comment.id ? 'true' : undefined}
									className="focus-visible:ring-ring/50 cursor-pointer rounded-sm text-left text-sm outline-none focus-visible:ring-[3px]"
									onClick={() => comments.select(comment)}
								>
									{comment.body}
								</button>
							) : (
								<p className="text-sm">{comment.body}</p>
							)}
							{comment.picture && <img className="max-w-60 rounded border" src={comment.picture} alt={`The spot ${comment.author} commented on`} />}
							{madeIn && <span className="text-muted-foreground text-xs">State: {stateLabel(madeIn)}</span>}
							{comment.anchor && state === 'elsewhere' && <span className="text-muted-foreground text-xs">On {comment.anchor.route}</span>}
							{state && NOTE[state] && <span className="text-warning text-xs">{NOTE[state]}</span>}
							{showIn && (
								<Button size="sm" variant="outline" className="self-start" onClick={() => onShowState?.(madeIn)}>
									Show in {stateLabel(showIn)}
								</Button>
							)}
							{showTheme && (
								<Button size="sm" variant="outline" className="self-start" onClick={() => shownTheme?.onTheme(showTheme)}>
									Show in {themeLabel(showTheme)}
								</Button>
							)}
						</div>
					</Item>
				);
			})}
		</>
	);
};
