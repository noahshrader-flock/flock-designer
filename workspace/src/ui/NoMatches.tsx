import { Message } from './Message';

/** What a search that finds nothing says, as every list's does: what was looked for, and a way to clear it. */
export const NoMatches = ({ thing, search, onClear }: { thing: string; search: string; onClear: () => void }) => (
	<Message inset action={{ label: 'Clear search', onPress: onClear }}>
		No {thing} matches “{search.trim()}”.
	</Message>
);
