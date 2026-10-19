import { Button } from '../../ui/Button';
import type { Comments } from './useComments';

/**
 * Two buttons, side by side in the bar's row: comment mode, then the list of comments. Each is pressed while it is on, so
 * which is on is readable at a glance.
 */
export const CommentControl = ({
	comments,
	listOpen,
	onToggleList,
	disabled,
}: {
	comments: Comments;
	listOpen: boolean;
	onToggleList: () => void;
	/** Nothing to comment on yet: the page is not up. */
	disabled: boolean;
}) => (
	// Each title is a hint for when the button can be pressed: a disabled button never shows one.
	<>
		<Button
			icon="location"
			pressed={comments.commentMode}
			disabled={disabled}
			{...(disabled ? {} : { title: 'Comment: click anywhere on the page to leave one; hold Shift to see what it attaches to (C)' })}
			onPress={comments.toggleCommentMode}
		>
			Comment
		</Button>
		<Button
			icon="comment-discussion"
			pressed={listOpen}
			label={comments.total > 0 ? `Show all comments (${comments.total})` : 'Show all comments'}
			disabled={disabled}
			{...(disabled ? {} : { title: comments.total > 0 ? `All comments (${comments.total})` : 'All comments' })}
			onPress={onToggleList}
		>
			{comments.total > 0 ? comments.total : null}
		</Button>
	</>
);
