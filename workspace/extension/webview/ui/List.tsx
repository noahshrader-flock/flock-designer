import type { ReactNode } from 'react';

/**
 * A list of rows (`Row`), named for assistive technology. The role is said outright: a list drawn without its bullets is
 * otherwise not always read as one.
 */
export const List = ({ label, children }: { label: string; children: ReactNode }) => (
	<ul role="list" aria-label={label} className="list">
		{children}
	</ul>
);
