import type { ReactNode } from 'react';

const LEVEL = { page: 'h1', part: 'h2', group: 'h3', label: 'h3', set: 'h4' } as const;

export const Heading = ({ size, children }: { size: keyof typeof LEVEL; children: ReactNode }) => {
	const Tag = LEVEL[size];
	return <Tag className={`heading heading-${size}`}>{children}</Tag>;
};
