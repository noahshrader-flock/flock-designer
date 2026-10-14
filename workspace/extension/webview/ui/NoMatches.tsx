/** What a search that finds nothing says, as every list's does: what was looked for, and a way to clear it. */
export const NoMatches = ({ thing, search, onClear }: { thing: string; search: string; onClear: () => void }) => (
	<p className="note">
		No {thing} matches “{search.trim()}”.{' '}
		<button type="button" className="link" onClick={onClear}>
			Clear search
		</button>
	</p>
);
