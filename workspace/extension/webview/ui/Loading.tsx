import type { ReactNode } from 'react';

/** What a view says while it reads, centered across and down the room it has, as an empty state is (`EmptyState`). */
export const Loading = ({ children }: { children: ReactNode }) => (
	<div className="empty">
		<p role="status">{children}</p>
	</div>
);
