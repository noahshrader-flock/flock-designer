import type { ReactNode } from 'react';

/**
 * The top of a card: an area twice as wide as it is tall (1920 by 960), whatever the card's width, so the tops of cards in a
 * grid are always even. It is the card's own color, and its left edge is where the footer's content starts (18px), so
 * the name on the cover lines up with who it is by under it. Its content is spread top to bottom (a first child at the top, a
 * last at the bottom), and a card using it drops its own top padding (`pt-0`) so the cover sits flush with the edge.
 * With `bleed` the cover has no padding and no layout of its own: what is in it fills it edge to edge (a picture does).
 */
export const CardCover = ({ children, bleed = false }: { children?: ReactNode; bleed?: boolean }) => (
	<div
		data-slot="card-cover"
		// The card puts a gap under its cover; a picture runs through it to the footer, as its own color does for a card without one.
		className={`aspect-[1920/960] w-full ${bleed ? 'relative mb-[calc(var(--card-spacing)*-1)] overflow-hidden' : 'flex flex-col justify-between py-3 pr-3 pl-4.5'}`}
	>
		{children}
	</div>
);
