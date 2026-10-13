import type { ReactNode } from 'react';
import { PICTURE_SHAPE } from './PictureArea';
import { cn } from '@/lib/utils';

/**
 * The top of a card, where its picture goes: an area twice as wide as it is tall (1920 by 960), whatever the card's width, so
 * the tops of cards in a grid are always even. The same on every card, a component's and a project's. It is edge to edge,
 * with no padding and no layout of its own: what is in it fills it (a picture does), and a card using it drops its own top
 * padding (`pt-0`) so the cover sits flush with the edge.
 */
export const CardCover = ({ children }: { children?: ReactNode }) => (
	<div
		data-slot="card-cover"
		// The card puts a gap under its cover; a picture runs through it to the footer.
		className={cn('relative mb-[calc(var(--card-spacing)*-1)]', PICTURE_SHAPE, 'w-full overflow-hidden')}
	>
		{children}
	</div>
);
