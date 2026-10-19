import { Button } from '../../ui/Button';
import type { Comments } from './useComments';

export const CommentControl = ({
	comments,
	listOpen,
	onToggleList,
	disabled,
}: {
	comments: Comments;
	listOpen: boolean;
	onToggleList: () => void;
	disabled: boolean;
}) => (
	// A disabled button never shows its title.
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
