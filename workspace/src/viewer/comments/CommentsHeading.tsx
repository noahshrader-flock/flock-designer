import { Heading } from '../../ui/Heading';
import type { Comments } from './useComments';

/** The comments panel's heading, with how many are open. */
export const CommentsHeading = ({ comments }: { comments: Comments }) => (
	<Heading size="part">{comments.total > 0 ? `Comments (${comments.total})` : 'Comments'}</Heading>
);
