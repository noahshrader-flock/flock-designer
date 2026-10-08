import type { ReactNode } from 'react';

/**
 * The top of a card: an area in the ratio of a 1920 by 1080 screen, whatever the card's width, so the tops of cards in a
 * grid are always even. A card using it drops its own top padding (`pt-0`) so the cover sits flush with the card's edge.
 * What fills it is the caller's; without anything it is an empty, quiet area.
 */
export const CardCover = ({ children }: { children?: ReactNode }) => (
	<div className="bg-muted text-muted-foreground flex aspect-[1920/1080] w-full items-center justify-center">{children}</div>
);
