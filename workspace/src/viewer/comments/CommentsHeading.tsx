import { Heading } from '../../ui/Heading';
import type { Comments } from './useComments';

export const CommentsHeading = ({ comments }: { comments: Comments }) => (
	<Heading size="part">{comments.total > 0 ? `Comments (${comments.total})` : 'Comments'}</Heading>
);
