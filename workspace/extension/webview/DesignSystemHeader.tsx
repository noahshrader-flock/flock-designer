import type { ReactNode } from 'react';
import { Icon } from './ui/Icon';

/**
 * The design system's own row, kept at the top of the panel while its lists scroll: its name, then, directly after it, an icon
 * whose tooltip is the branch it is read from, and at the right its buttons (`children`: the counts, its menu). A long name is
 * cut with an ellipsis and the icon stays after it, a gap from the buttons, the gap there is between the buttons themselves.
 */
export const DesignSystemHeader = ({ name, branch, children }: { name: string; branch: string; children: ReactNode }) => (
	<div className="ds-header">
		<span className="ds-title">
			<span data-part="name" className="ds-name">
				{name}
			</span>
			<span data-part="branch" role="img" aria-label={`Branch ${branch}`} title={branch} className="ds-branch">
				<Icon name="git-branch" size="xs" />
			</span>
		</span>
		<span className="ds-actions">{children}</span>
	</div>
);
