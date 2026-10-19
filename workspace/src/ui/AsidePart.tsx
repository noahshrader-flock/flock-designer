import type { ReactNode } from 'react';
import { Heading } from './Heading';

export const AsidePart = ({ title, children }: { title: string; children: ReactNode }) => (
	<section aria-label={title} className="aside-section">
		<div className="aside-heading">
			<Heading size="part">{title}</Heading>
		</div>
		{children}
	</section>
);
