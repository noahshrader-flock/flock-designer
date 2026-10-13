import type { ReactNode } from 'react';
import { CardCover } from './CardCover';
import { CardGrid } from './CardGrid';
import { ROW_LAYOUT, RowList, THUMBNAIL } from './ListRow';
import { Card, CardFooter } from './ui/card';
import { COMPONENT_FOOTER, PROJECT_FOOTER } from './cardFooters';
import { Skeleton } from './ui/skeleton';
import { cn } from '@/lib/utils';

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

/**
 * A card of a grid while its content loads: the cover, and a footer of one row, a component's name and group, or of two
 * (`detail`), a project's name and under it who it is by and what it has. The same sizes as the cards, so nothing jumps.
 */
export const CardSkeleton = ({ detail = false }: { detail?: boolean }) => (
	<Card className="pt-0">
		<CardCover>
			<Skeleton className="absolute inset-0 rounded-none" />
		</CardCover>
		{/* The footer is the skeleton's own color (muted), so its lines are a shade of the text instead, to be seen on it. */}
		{detail ? (
			<CardFooter className={PROJECT_FOOTER}>
				<Skeleton className="bg-foreground/10 h-4 w-2/5" />
				<div className="flex items-center justify-between gap-2">
					<Skeleton className="bg-foreground/10 h-4 w-1/3" />
					<Skeleton className="bg-foreground/10 h-4 w-1/5" />
				</div>
			</CardFooter>
		) : (
			<CardFooter className={COMPONENT_FOOTER}>
				<Skeleton className="bg-foreground/10 h-4 w-1/3" />
				<Skeleton className="bg-foreground/10 h-4 w-1/5" />
			</CardFooter>
		)}
	</Card>
);

/** A grid of cards while they load: a row or two's worth. */
export const CardGridSkeleton = ({ detail = false, count = 6 }: { detail?: boolean; count?: number }) => (
	<CardGrid>
		{Array.from({ length: count }, (_, i) => (
			<CardSkeleton key={i} detail={detail} />
		))}
	</CardGrid>
);

/**
 * A list of rows while it loads, in the list's own box: a name and a line under it, and with `thumbnails` the picture's
 * shape at the left, as a list with pictures has, so nothing jumps when its rows arrive.
 */
export const RowsSkeleton = ({ count = 6, thumbnails = false }: { count?: number; thumbnails?: boolean }) => (
	<RowList>
		{Array.from({ length: count }, (_, i) => (
			<li key={i} className={ROW_LAYOUT}>
				{thumbnails && <Skeleton data-thumbnail-skeleton className={cn('rounded-md', THUMBNAIL)} />}
				<div className="flex grow flex-col gap-1.5">
					<Skeleton className="h-4 w-1/4" />
					<Skeleton className="h-4 w-2/5" />
				</div>
			</li>
		))}
	</RowList>
);

/** Lines of text while they load, the last one shorter, as a paragraph ends. */
export const LinesSkeleton = ({ count = 4 }: { count?: number }) => (
	<div className="flex flex-col gap-2">
		{Array.from({ length: count }, (_, i) => (
			<Skeleton key={i} className={cn('h-4', i === count - 1 ? 'w-3/5' : 'w-full')} />
		))}
	</div>
);
