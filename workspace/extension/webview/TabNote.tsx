import { Message, tryAgain } from '../../src/ui/Message';

export const TabNote = ({ says, onRetry, waiting = false }: { says: string; onRetry: (() => void) | null; waiting?: boolean }) => (
	<Message size="page" waiting={waiting} action={tryAgain(onRetry)}>
		{says}
	</Message>
);
