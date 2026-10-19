import { type MouseEvent as ClickEvent, type ReactNode, useState } from 'react';
import type { MarkerState, ReviewComment } from '../../shared/contract';
import { stateLabel, stateOfQuery } from '../../shared/prototypeStates';
import type { ShownTheme } from '../useShownTheme';
import { themeLabel } from '../../shared/prototypeTheme';
import { Avatar } from '../../ui/Avatar';
import { Button } from '../../ui/Button';
import { Menu, type MenuItem } from '../../ui/Menu';
import { Message } from '../../ui/Message';
import type { Comments } from './useComments';

/** What a card says about where its pin is, when that is worth saying. */
const NOTE: Record<MarkerState, string | null> = {
	found: null,
	moved: 'The element changed, so this follows its text.',
	missing: 'The element is no longer on the page, so this is shown as a page comment.',
	elsewhere: null,
	otherState: 'Made in a different state of this page, so it is not pinned here.',
};

/**
 * Every comment on the version, as cards: who wrote it, what it says, the spot it was made on, and a menu to resolve
 * or delete it. `actions` puts more at the top of a card's menu (Address, in DSNR), and `addressed` says on a card
 * what the agent did with it, both left to the screen this sits in. `states` are the prototype's, so a card can name
 * the state it was made in; `onShowState` opens the page in it (`null` is the first), from a comment made in another.
 * `shownTheme` is the theme the page is shown in: a comment seen in the other one has a button to show the page in that.
 * `page` is the fingerprint of the page shown: a comment placed on another says the page has changed since.
 */
export const CommentList = ({
	comments,
	actions,
	addressed,
	states = [],
	onShowState,
	shownTheme,
	page,
}: {
	comments: Comments;
	actions?: (comment: ReviewComment) => MenuItem[];
	addressed?: (comment: ReviewComment) => ReactNode;
	states?: string[];
	onShowState?: (state: string | null) => void;
	shownTheme?: ShownTheme;
	page?: string | undefined;
}) => {
	// Deleting cannot be undone, so it asks first, on the card itself (a dialog would have to take the preview's place).
	const [confirmingDelete, setConfirmingDelete] = useState<number | null>(null);
	// The newest at the top, as a conversation reads; each keeps its number (`numberComments`), which is the order made.
	const list = comments.comments && [...comments.comments].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
	if (list?.length === 0) return <Message>No comments yet. Choose Comment and click on the page, or write one below for the whole page.</Message>;
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
					<div
						key={comment.id}
						ref={(el: HTMLDivElement | null) => comments.registerCard(comment.id, el)}
						// The selected one stands out as the pin on the page does; a resolved one recedes. A choosable card is chosen by
						// pressing anywhere on it but the buttons and menu on it.
						className="comment-card"
						{...(choosable ? { 'data-choosable': '' } : {})}
						{...(comments.selected === comment.id ? { 'data-selected': '' } : {})}
						{...(comment.resolved ? { 'data-resolved': '' } : {})}
						{...(choosable
							? {
									onClick: (e: ClickEvent) => {
										if (!(e.target as HTMLElement).closest('button, a, input, textarea, [role="menu"], [role="menuitem"]')) comments.select(comment);
									},
								}
							: {})}
					>
						<div className="comment-head">
							<Avatar name={comment.author} src={comment.authorAvatarUrl} size="xs" />
							<span className="comment-author">{comment.author}</span>
							{comment.resolved && <Message icon="pass">Resolved</Message>}
							<Menu
								label="Comment actions"
								size="small"
								always
								sections={[
									...(actions ? [{ items: actions(comment) }] : []),
									{
										items: [
											{
												label: comment.resolved ? 'Reopen' : 'Resolve',
												icon: comment.resolved ? 'discard' : 'pass',
												onSelect: () => void comments.resolve(comment, !comment.resolved),
											},
										],
									},
									{ items: [{ label: 'Delete', icon: 'trash', onSelect: () => setConfirmingDelete(comment.id) }] },
								].filter((s) => s.items.length > 0)}
							/>
						</div>
						{note && <Message>{note}</Message>}
						{confirmingDelete === comment.id && (
							<div className="comment-delete">
								<Message tone="warning">Delete this comment for good? It cannot be brought back.</Message>
								<Button variant="ghost" onClick={() => setConfirmingDelete(null)}>
									Keep
								</Button>
								<Button onClick={() => void comments.remove(comment).then((gone) => gone && setConfirmingDelete(null))}>Delete</Button>
							</div>
						)}
						{/* Choosing a comment shows its pin: anywhere on its card with a pointer, and by its own text, a button, for the keyboard. */}
						{choosable ? (
							<button
								type="button"
								aria-current={comments.selected === comment.id ? 'true' : undefined}
								className="comment-body"
								onClick={() => comments.select(comment)}
							>
								{comment.body}
							</button>
						) : (
							<p className="comment-body">{comment.body}</p>
						)}
						{comment.picture && <img className="comment-picture" src={comment.picture} alt={`The spot ${comment.author} commented on`} />}
						{madeIn && <Message>State: {stateLabel(madeIn)}</Message>}
						{comment.anchor && state === 'elsewhere' && <Message>On {comment.anchor.route}</Message>}
						{state && NOTE[state] && <Message tone="warning">{NOTE[state]}</Message>}
						{state && page && comment.anchor?.page && comment.anchor.page !== page && <Message>The page has changed since this was written.</Message>}
						{showIn && (
							<Button variant="secondary" onClick={() => onShowState?.(madeIn)}>
								Show in {stateLabel(showIn)}
							</Button>
						)}
						{showTheme && (
							<Button variant="secondary" onClick={() => shownTheme?.onTheme(showTheme)}>
								Show in {themeLabel(showTheme)}
							</Button>
						)}
					</div>
				);
			})}
		</>
	);
};
