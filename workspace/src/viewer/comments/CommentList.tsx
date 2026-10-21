import { type MouseEvent as ClickEvent, type ReactNode, useState } from 'react';
import type { MarkerState, ReviewComment } from '../../shared/contract';
import { stateLabel, stateOfQuery } from '../../shared/prototypeStates';
import type { ShownTheme } from '../useShownTheme';
import { themeLabel } from '../../shared/prototypeTheme';
import { Avatar } from '../../ui/Avatar';
import { Button, ButtonRow } from '../../ui/Button';
import { Menu, type MenuItem } from '../../ui/Menu';
import { Message } from '../../ui/Message';
import { ListDisclosure } from '../../ui/Section';
import type { Comments } from './useComments';

const NOTE: Record<MarkerState, string | null> = {
	found: null,
	moved: 'The element changed, so this follows its text.',
	missing: 'The element is no longer on the page, so this is shown as a page comment.',
	elsewhere: null,
	otherState: 'Made in a different state of this page, so it is not pinned here.',
};

/** `page` is the fingerprint of the page shown, to say it has changed since a comment was written. */
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
	// Asked on the card itself: a dialog would have to take the preview's place.
	const [confirmingDelete, setConfirmingDelete] = useState<number | null>(null);
	// Each keeps its number (`numberComments`), which is the order made.
	const list = comments.comments && [...comments.comments].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
	if (list?.length === 0) return <Message>No comments yet. Choose Comment and click on the page, or write one below for the whole page.</Message>;
	const card = (comment: ReviewComment) => {
		// A resolved comment has no pin (one the agent addressed is resolved too), so its last placing is about nothing.
		const state = comment.resolved ? undefined : comments.placed.get(comment.id);
		// Choosing a card shows its pin, so only one with a pin on the page can be chosen.
		const choosable = state === 'found' || state === 'moved';
		const note = comment.addressedAt !== null ? addressed?.(comment) : null;
		const madeIn = comment.anchor?.state === undefined ? null : stateOfQuery(comment.anchor.state, states);
		const target = madeIn ?? states[0];
		const showIn = state === 'otherState' && onShowState && target !== undefined && states.includes(target) ? target : null;
		const seenIn = comment.anchor?.theme;
		const showTheme = shownTheme && seenIn && seenIn !== shownTheme.theme ? seenIn : null;
		return (
			<div
				key={comment.id}
				ref={(el: HTMLDivElement | null) => comments.registerCard(comment.id, el)}
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
					<>
						<Message tone="warning">Delete this comment for good? It cannot be brought back.</Message>
						<ButtonRow>
							<Button variant="ghost" onPress={() => setConfirmingDelete(null)}>
								Keep
							</Button>
							<Button onPress={() => void comments.remove(comment).then((gone) => gone && setConfirmingDelete(null))}>Delete</Button>
						</ButtonRow>
					</>
				)}
				{/* The card is clickable with a pointer; this button is the keyboard's way to choose it. */}
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
				{(showIn || showTheme) && (
					<ButtonRow>
						{showIn && (
							<Button variant="secondary" onPress={() => onShowState?.(madeIn)}>
								Show in {stateLabel(showIn)}
							</Button>
						)}
						{showTheme && (
							<Button variant="secondary" onPress={() => shownTheme?.onTheme(showTheme)}>
								Show in {themeLabel(showTheme)}
							</Button>
						)}
					</ButtonRow>
				)}
			</div>
		);
	};
	// Resolved comments are folded under one line at the bottom, out of the way of the ones still open.
	const open = list?.filter((c) => !c.resolved);
	const resolved = list?.filter((c) => c.resolved) ?? [];
	return (
		<>
			{open?.map(card)}
			{resolved.length > 0 && <ListDisclosure label={`${resolved.length} resolved`}>{resolved.map(card)}</ListDisclosure>}
		</>
	);
};
