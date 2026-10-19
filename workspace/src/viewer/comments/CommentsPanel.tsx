import type { ComponentProps } from 'react';
import { Message } from '../../ui/Message';
import { COMMENTS_PANEL } from '../panelWidth';
import { ResizablePanel } from '../ResizablePanel';
import { CommentList } from './CommentList';
import { CommentsHeading } from './CommentsHeading';
import { GeneralComment } from './GeneralComment';
import type { Comments } from './useComments';

/**
 * The comments, docked beside a prototype's page and resizable: the heading, what went wrong, and the list, newest first;
 * and at its foot, a box for a comment on the whole page.
 */
export const CommentsPanel = ({
	comments,
	error,
	...list
}: {
	comments: Comments;
	error: string | null;
} & Omit<ComponentProps<typeof CommentList>, 'comments'>) => (
	<ResizablePanel panel={COMMENTS_PANEL} label="Resize the comments sidebar">
		<div className="comments-panel">
			<div className="comments-list">
				<CommentsHeading comments={comments} />
				<Message tone="error" size="block">
					{comments.composing ? null : error}
				</Message>
				<CommentList comments={comments} {...list} />
			</div>
			<GeneralComment comments={comments} />
		</div>
	</ResizablePanel>
);
