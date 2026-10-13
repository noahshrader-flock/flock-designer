import { type ReactNode, useState } from 'react';
import { Skeleton } from './ui/skeleton';
import { cn } from '@/lib/utils';

/** The shape of a picture, twice as wide as it is tall (1920 by 960): the cover of a card and a row's thumbnail alike, so a thumbnail is the card's picture, smaller. */
export const PICTURE_SHAPE = 'aspect-[1920/960]';

/**
 * Where a picture shows, filling the box it is in, edge to edge: a card's cover, or a row's thumbnail. The box is the same
 * size with or without a picture, so nothing moves when one arrives: a skeleton while one is on its way (`drawing`, or
 * loading), a still soft placeholder for none, and the picture fades in once it has loaded. A picture that would not load is
 * no picture: the placeholder, never a white block. The picture is decorative: the name is beside it. What is in `children`
 * is drawn over it (a card's accessibility badge).
 */
export const PictureArea = ({ picture, drawing = false, children }: { picture: string | undefined; drawing?: boolean; children?: ReactNode }) => {
	const [loaded, setLoaded] = useState<string | null>(null);
	const [failed, setFailed] = useState<string | null>(null);
	const shown = picture !== undefined && picture !== failed ? picture : undefined;
	// On its way: loading, or not yet taken by a pass that is drawing. One that failed to load is not waited for.
	const waiting = shown ? loaded !== shown : drawing && picture === undefined;
	return (
		<div data-picture-area className={cn('absolute inset-0', shown && loaded === shown ? 'bg-white' : 'bg-muted/40')}>
			{waiting && <Skeleton data-picture-waiting className="absolute inset-0 rounded-none" />}
			{children}
			{shown && (
				<img
					src={shown}
					alt=""
					decoding="async"
					onLoad={() => setLoaded(shown)}
					onError={() => setFailed(shown)}
					className={cn(
						'size-full object-contain transition-opacity duration-200 motion-reduce:transition-none',
						loaded === shown ? 'opacity-100' : 'opacity-0',
					)}
				/>
			)}
		</div>
	);
};
