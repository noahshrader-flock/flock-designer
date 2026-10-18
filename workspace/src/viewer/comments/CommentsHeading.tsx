import type { Comments } from './useComments';

/** The comments panel's heading, with how many are open. */
export const CommentsHeading = ({ comments }: { comments: Comments }) => (
	<h2 className="text-base font-semibold">{comments.total > 0 ? `Comments (${comments.total})` : 'Comments'}</h2>
);
