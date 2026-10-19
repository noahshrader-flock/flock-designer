import type { ReactNode } from 'react';
import { Heading } from './Heading';

/**
 * One part of what is said of a component, in a bordered box under a title (Styles, Tokens, Accessibility): named for assistive
 * technology by it. Its title stays at the top of the side pane while the part is in view, until the part ends and the next
 * part's takes its place (`.aside-heading`).
 */
export const AsidePart = ({ title, children }: { title: string; children: ReactNode }) => (
	<section aria-label={title} className="aside-section">
		<div className="aside-heading">
			<Heading size="part">{title}</Heading>
		</div>
		{children}
	</section>
);
