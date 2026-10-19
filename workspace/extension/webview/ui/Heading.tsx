import type { ReactNode } from 'react';

/**
 * Every heading, from a tab's down to a set of rows', so each is drawn by where it stands and the outline reads as the page
 * does: a tab's title (`page`, its one `h1`); a part of it (`part`: a side pane's part, a primitive); a group of values or
 * of tokens (`group`), with what they all are to its right; a quiet `label` over the sets it groups; and a set of rows
 * (`set`), as tall as a row under it.
 */
const LEVEL = { page: 'h1', part: 'h2', group: 'h3', label: 'h3', set: 'h4' } as const;

export const Heading = ({ size, children }: { size: keyof typeof LEVEL; children: ReactNode }) => {
	const Tag = LEVEL[size];
	return <Tag className={`heading heading-${size}`}>{children}</Tag>;
};
