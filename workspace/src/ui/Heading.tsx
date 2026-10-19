import type { ReactNode } from 'react';

/**
 * Every heading, drawn by where it stands so the outline reads as the page does: a tab's title (`page`, its one `h1`), a
 * `part` of it, a `group` of values or tokens, a quiet `label` over the sets it groups, and a `set` of rows.
 */
const LEVEL = { page: 'h1', part: 'h2', group: 'h3', label: 'h3', set: 'h4' } as const;

export const Heading = ({ size, children }: { size: keyof typeof LEVEL; children: ReactNode }) => {
	const Tag = LEVEL[size];
	return <Tag className={`heading heading-${size}`}>{children}</Tag>;
};
