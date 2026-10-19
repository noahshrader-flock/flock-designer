import { Message } from './Message';

export const NoMatches = ({ thing, search, onClear }: { thing: string; search: string; onClear: () => void }) => (
	<Message inset action={{ label: 'Clear search', onPress: onClear }}>
		No {thing} matches “{search.trim()}”.
	</Message>
);
