/** A count beside a row, as VS Code draws one on a view or a tab: its badge colours, and what the number is, said. */
export const Badge = ({ count, label }: { count: number; label: string }) => (
	<span className="badge" aria-label={label}>
		{count}
	</span>
);
