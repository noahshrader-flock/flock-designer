import { InlineAction } from './Links';

/** What a search over a list says when it finds nothing, with a way to clear it: the same over projects and components. */
export const NoMatches = ({ thing, search, onClear }: { thing: string; search: string; onClear: () => void }) => (
	<p className="text-muted-foreground text-sm">
		No {thing} matches “{search.trim()}”. <InlineAction onClick={onClear}>Clear search</InlineAction>
	</p>
);
