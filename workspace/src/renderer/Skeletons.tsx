import type { ReactNode } from 'react';
import { CardCover } from './CardCover';
import { CardGrid } from './CardGrid';
import { Card, CardFooter } from './ui/card';
import { Skeleton } from './ui/skeleton';

/**
 * Content on its way, drawn as shadcn's `Skeleton` in the shape of what is coming, so nothing jumps when it arrives. The
 * one way content waits everywhere in the app; a job running (a sync, a share, a clone, an agent building) keeps its
 * spinner, since it is not content and its shape is not known.
 *
 * Each says what is loading to a screen reader, in words, as the spinner's line did: the shapes alone say nothing.
 */
export const SkeletonStatus = ({ label, className, children }: { label: string; className?: string; children: ReactNode }) => (
	<div role="status" aria-busy="true" className={className}>
		<span className="sr-only">{label}</span>
		<div aria-hidden className="contents">
			{children}
		</div>
	</div>
);

/** A card of a grid while its content loads: a picture's cover (`picture`), or the card's own color with a name at its foot. */
export const CardSkeleton = ({ picture = false }: { picture?: boolean }) => (
	<Card className="pt-0">
		{picture ? (
			<CardCover bleed>
				<Skeleton className="absolute inset-0 rounded-none" />
			</CardCover>
		) : (
			<CardCover>
				<span />
				<Skeleton className="h-5 w-2/5" />
			</CardCover>
		)}
		{/* The footer is the skeleton's own color (muted), so its lines are a shade of the text instead, to be seen on it. */}
		<CardFooter className="mt-auto flex h-12 items-center justify-between gap-2 pr-3 pl-4.5">
			<Skeleton className="bg-foreground/10 h-4 w-1/3" />
			<Skeleton className="bg-foreground/10 h-4 w-1/5" />
		</CardFooter>
	</Card>
);

/** A grid of cards while they load: a row or two's worth. */
export const CardGridSkeleton = ({ picture = false, count = 6 }: { picture?: boolean; count?: number }) => (
	<CardGrid>
		{Array.from({ length: count }, (_, i) => (
			<CardSkeleton key={i} picture={picture} />
		))}
	</CardGrid>
);

/** A list of rows while it loads, in the list's own box: a name and a line under it. */
export const RowsSkeleton = ({ count = 6 }: { count?: number }) => (
	<ul className="bg-card divide-y rounded-lg border">
		{Array.from({ length: count }, (_, i) => (
			<li key={i} className="flex flex-col gap-1.5 px-4 py-3">
				<Skeleton className="h-4 w-1/4" />
				<Skeleton className="h-4 w-2/5" />
			</li>
		))}
	</ul>
);

/** Lines of text while they load, the last one shorter, as a paragraph ends. */
export const LinesSkeleton = ({ count = 4 }: { count?: number }) => (
	<div className="flex flex-col gap-2">
		{Array.from({ length: count }, (_, i) => (
			<Skeleton key={i} className={`h-4 ${i === count - 1 ? 'w-3/5' : 'w-full'}`} />
		))}
	</div>
);
