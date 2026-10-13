import type { ReactNode } from 'react';

/**
 * One thing in a list, as a row of VS Code's own lists: a picture or an icon at its start, a name, a quieter line under
 * it, and whatever belongs at its end (a badge). The name and the line are cut with an ellipsis when the side bar is
 * narrow, never wrapped.
 */
export const Row = ({ start, name, meta, end }: { start?: ReactNode; name: string; meta?: string; end?: ReactNode }) => (
	<li role="listitem" className="row">
		{start}
		<span className="row-text">
			<span data-part="name" className="row-name">
				{name}
			</span>
			{meta && (
				<span data-part="meta" className="row-meta">
					{meta}
				</span>
			)}
		</span>
		{end}
	</li>
);
