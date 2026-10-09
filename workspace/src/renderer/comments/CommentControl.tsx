import { MapPinIcon, MessageSquareIcon } from 'lucide-react';
import { Button } from '../ui/button';
import type { Comments } from './useComments';

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
	<div className="flex items-center">
		<Button
			variant={comments.commentMode ? 'default' : 'outline'}
			aria-pressed={comments.commentMode}
			disabled={disabled}
			title="Comment: click anywhere on the page to leave one (C)"
			className="rounded-r-none"
			onClick={comments.toggleCommentMode}
		>
			<MapPinIcon />
			Comment
		</Button>
		<Button
			variant={listOpen ? 'default' : 'outline'}
			aria-pressed={listOpen}
			aria-label="Show all comments"
			disabled={disabled}
			title={comments.total > 0 ? `All comments (${comments.total})` : 'All comments'}
			className="rounded-l-none border-l-0"
			onClick={onToggleList}
		>
			<MessageSquareIcon />
			{comments.total > 0 ? comments.total : null}
		</Button>
	</div>
);
