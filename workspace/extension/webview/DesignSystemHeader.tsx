import type { ReactNode } from 'react';
import { Icon } from '../../src/ui/Icon';

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
