import type { ReactNode } from 'react';

/**
 * A screen's content under its toolbar: one centered column, the same width and padding on every screen. A screen of
 * cards in a grid is `wide`: it uses the window's width, since a grid needs room for its columns where text needs a
 * readable line.
 */
export const Page = ({ children, wide = false }: { children: ReactNode; wide?: boolean }) => (
	<div className={`mx-auto flex flex-col gap-4 p-(--page-padding) ${wide ? '' : 'max-w-page'}`}>{children}</div>
);
