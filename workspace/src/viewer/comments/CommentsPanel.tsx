import type { ComponentProps } from 'react';
import { Message } from '../../ui/Message';
import { COMMENTS_PANEL } from '../panelWidth';
import { ResizablePanel } from '../ResizablePanel';
import { CommentList } from './CommentList';
import { CommentsHeading } from './CommentsHeading';
import { GeneralComment } from './GeneralComment';
import type { Comments } from './useComments';

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
