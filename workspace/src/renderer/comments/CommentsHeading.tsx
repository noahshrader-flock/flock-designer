import type { ReactNode } from 'react';
import type { Comments } from './useComments';

/** The comments panel's heading, with how many are open, and anything the screen puts beside it. */
export const CommentsHeading = ({ comments, children }: { comments: Comments; children?: ReactNode }) => (
	<div className="flex items-center gap-2">
		<h3 className="grow text-sm font-semibold">{comments.total > 0 ? `Comments (${comments.total})` : 'Comments'}</h3>
		{children}
	</div>
);
