import type { ComponentProps, ReactNode } from 'react';
import { ErrorAlert } from '../ErrorAlert';
import { COMMENTS_PANEL } from '../panelWidth';
import { ResizablePanel } from '../ResizablePanel';
import { CommentList } from './CommentList';
import { CommentsHeading } from './CommentsHeading';
import type { Comments } from './useComments';

/**
 * The comments, docked beside the page and resizable, the same in the app and on a prototype's published page: the
 * heading (with what the screen adds to it, `heading`), what went wrong, what the screen says about the work (`children`:
 * the review screen's Address runs), and the list.
 */
export const CommentsPanel = ({
	comments,
	error,
	heading,
	onResizing,
	children,
	...list
}: {
	comments: Comments;
	error: string | null;
	heading?: ReactNode;
	/** Told when a drag of the divider starts and ends, for a page that must step aside meanwhile. */
	onResizing?: (resizing: boolean) => void;
	children?: ReactNode;
} & Omit<ComponentProps<typeof CommentList>, 'comments'>) => (
	<ResizablePanel panel={COMMENTS_PANEL} label="Resize the comments sidebar" onResizing={onResizing}>
		<div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
			<CommentsHeading comments={comments}>{heading}</CommentsHeading>
			{error && !comments.composing && <ErrorAlert error={error} />}
			{children}
			<CommentList comments={comments} {...list} />
		</div>
	</ResizablePanel>
);
