import type { ReactNode } from 'react';

/** A grid of cards (`Card`), named for assistive technology as a list is: the same things as `List`, drawn as cards. */
export const Grid = ({ label, children }: { label: string; children: ReactNode }) => (
	<ul role="list" aria-label={label} className="grid">
		{children}
	</ul>
);
