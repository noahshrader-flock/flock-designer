import type { ReactNode } from 'react';
import { Icon } from './Icon';

/**
 * What a view says when it has nothing to show, the one way everywhere: centered across and down the room it has, a large
 * quiet icon, what is missing as the heading, what to know or do about it in plain text, then the button when there is one.
 */
export const EmptyState = ({ icon, title, children }: { icon: string; title: string; children: ReactNode }) => (
	<div className="empty">
		<div className="empty-content">
			<span className="empty-icon">
				<Icon name={icon} />
			</span>
			<p className="empty-title">
				<span data-part="title">{title}</span>
			</p>
			<div className="empty-body">{children}</div>
		</div>
	</div>
);
