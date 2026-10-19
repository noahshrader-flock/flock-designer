import type { ComponentProps, ReactNode } from 'react';
import { Message } from '../../ui/Message';
import { COMMENTS_PANEL } from '../panelWidth';
import { ResizablePanel } from '../ResizablePanel';
import { CommentList } from './CommentList';
import { CommentsHeading } from './CommentsHeading';
import { GeneralComment } from './GeneralComment';
import type { Comments } from './useComments';

/**
 * The comments, docked beside the page and resizable, the same in the app and on a prototype's published page: the
 * heading, what went wrong, what the screen says about the work (`children`:
 * the review screen's Address runs), and the list, newest first; and at its foot, a box for a comment on the whole page.
 */
export const CommentsPanel = ({
	comments,
	error,
	onResizing,
	children,
	...list
}: {
	comments: Comments;
	error: string | null;
	/** Told when a drag of the divider starts and ends, for a page that must step aside meanwhile. */
	onResizing?: (resizing: boolean) => void;
	children?: ReactNode;
} & Omit<ComponentProps<typeof CommentList>, 'comments'>) => (
	<ResizablePanel panel={COMMENTS_PANEL} label="Resize the comments sidebar" onResizing={onResizing}>
		<div className="comments-panel">
			<div className="comments-list">
				<CommentsHeading comments={comments} />
				<Message tone="error" size="block">
					{comments.composing ? null : error}
				</Message>
				{children}
				<CommentList comments={comments} {...list} />
			</div>
			<GeneralComment comments={comments} />
		</div>
	</ResizablePanel>
);
