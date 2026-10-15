import { MapPinIcon, MessageSquareIcon } from 'lucide-react';
import { Button } from '../ui/button';
import type { Comments } from './useComments';
import { ButtonGroup } from '../ui/button-group';

/**
 * One control, two halves: comment mode on the left, the list of comments on the right. A pressed half is filled rather
 * than outlined, so which mode is on is readable at a glance.
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
	<ButtonGroup>
		<Button
			variant={comments.commentMode ? 'default' : 'outline'}
			aria-pressed={comments.commentMode}
			disabled={disabled}
			title={disabled ? undefined : 'Comment: click anywhere on the page to leave one; hold Shift to see what it attaches to (C)'}
			onClick={comments.toggleCommentMode}
		>
			<MapPinIcon />
			Comment
		</Button>
		<Button
			variant={listOpen ? 'default' : 'outline'}
			aria-pressed={listOpen}
			aria-label={comments.total > 0 ? `Show all comments (${comments.total})` : 'Show all comments'}
			disabled={disabled}
			title={disabled ? undefined : comments.total > 0 ? `All comments (${comments.total})` : 'All comments'}
			onClick={onToggleList}
		>
			<MessageSquareIcon />
			{comments.total > 0 ? comments.total : null}
		</Button>
	</ButtonGroup>
);
