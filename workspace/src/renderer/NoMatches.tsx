/** What a search over a list says when it finds nothing, with a way to clear it: the same over projects and components. */
export const NoMatches = ({ thing, search, onClear }: { thing: string; search: string; onClear: () => void }) => (
	<p className="text-muted-foreground text-sm">
		No {thing} matches “{search.trim()}”.{' '}
		<button type="button" className="text-primary underline underline-offset-4" onClick={onClear}>
			Clear search
		</button>
	</p>
);
