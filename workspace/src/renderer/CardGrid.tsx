import type { ReactNode } from 'react';

/**
 * Cards in a responsive grid, by the width of the space the grid has rather than the window's, so it holds wherever it
 * is put: one column when narrow, then two, three (the usual width of the window), four and five. The cards in a row are
 * the same height.
 */
export const CardGrid = ({ children }: { children: ReactNode }) => (
	<div className="@container">
		<div className="grid grid-cols-1 gap-4 @2xl:grid-cols-2 @4xl:grid-cols-3 @6xl:grid-cols-4 @7xl:grid-cols-5">{children}</div>
	</div>
);
