import type { ReactNode } from 'react';

/**
 * What a view says when it has nothing to show, as VS Code's welcome views do: what is missing, in a line, then what to
 * know or do about it, in plain text, left-aligned in the side bar.
 */
export const EmptyState = ({ icon, title, children }: { icon: string; title: string; children: ReactNode }) => (
	<div className="empty">
		<p className="empty-title">
			<span aria-hidden="true" className={`codicon codicon-${icon}`} />
			<span data-part="title">{title}</span>
		</p>
		<div className="empty-body">{children}</div>
	</div>
);
