import { Message, tryAgain } from '../../src/ui/Message';

export const TabNote = ({ says, onRetry }: { says: string; onRetry: (() => void) | null }) => (
	<Message size="page" action={tryAgain(onRetry)}>
		{says}
	</Message>
);
