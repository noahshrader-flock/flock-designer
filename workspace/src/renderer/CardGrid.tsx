import type { ReactNode } from 'react';

/**
 * Cards in a responsive grid, by the width of the space the grid has rather than the window's, so it holds wherever it
 * is put: one column when narrow, then two, three (the usual width of the window), four and five. A card is at least
 * about 320 pixels wide at every step. The cards in a row are the same height.
 */
export const CardGrid = ({ children }: { children: ReactNode }) => (
	<div className="@container">
		<div className="grid grid-cols-1 gap-4 @3xl:grid-cols-2 @5xl:grid-cols-3 @min-[84rem]:grid-cols-4 @min-[104rem]:grid-cols-5">{children}</div>
	</div>
);
