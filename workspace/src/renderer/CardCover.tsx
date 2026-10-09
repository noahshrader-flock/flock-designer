import type { ReactNode } from 'react';

/**
 * The top of a card: an area in the ratio of a 1920 by 1080 screen, whatever the card's width, so the tops of cards in a
 * grid are always even. It is the card's own colour, and its left edge is where the footer's content starts (18px), so
 * the name on the cover lines up with who it is by under it. Its content is spread top to bottom (a first child at the top, a
 * last at the bottom), and a card using it drops its own top padding (`pt-0`) so the cover sits flush with the edge.
 */
export const CardCover = ({ children }: { children?: ReactNode }) => (
	<div className="flex aspect-[1920/1080] w-full flex-col justify-between py-3 pr-3 pl-4.5">{children}</div>
);
