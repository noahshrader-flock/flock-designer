import { Message, tryAgain } from '../../src/ui/Message';

/**
 * What a design system's tab says in place of it (`useTabCatalog`'s note): that it is being read, what went wrong, or that
 * it cannot be read here, as the whole of the tab, with Try again when reading it again can help.
 */
export const TabNote = ({ says, onRetry }: { says: string; onRetry: (() => void) | null }) => (
	<Message size="page" action={tryAgain(onRetry)}>
		{says}
	</Message>
);
