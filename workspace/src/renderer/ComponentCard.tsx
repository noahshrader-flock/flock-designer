import { AccessibilityIcon } from 'lucide-react';
import { useState } from 'react';
import { summaryOf } from '../shared/accessibility';
import type { AccessibilityCounts, CatalogComponent } from '../shared/contract';
import { CardCover } from './CardCover';
import { PRESSABLE_CARD, pressableCard } from './pressableCard';
import { Badge } from './ui/badge';
import { Card, CardFooter, CardTitle } from './ui/card';
import { Skeleton } from './ui/skeleton';

/**
 * A component in the grid view (P5 of the design system plan, decision 31): the Projects card, its cover a picture of the
 * component's first story, filling the cover edge to edge (it is taken in the cover's own shape, around the component),
 * its footer the component's name and its group. The cover is the same size with or without a picture, so nothing moves
 * when one arrives: a skeleton while one is on its way (`drawing`, or loading), a still soft placeholder for a component
 * with none, and the picture fades in once it has loaded. The picture is
 * decorative: the name is beside it. The whole card opens the component.
 *
 * When axe found issues in its stories (T7), a badge on the cover says how many, and the card's name says it in words, as
 * the panel does. A component with none shows nothing: no result is a pass.
 */
export const ComponentCard = ({
	component,
	picture,
	drawing = false,
	issues,
	onOpen,
}: {
	component: CatalogComponent;
	picture: string | undefined;
	drawing?: boolean;
	issues?: AccessibilityCounts;
	onOpen: () => void;
}) => {
	const [loaded, setLoaded] = useState<string | null>(null);
	// A picture that would not load is no picture: the placeholder, never a white block.
	const [failed, setFailed] = useState<string | null>(null);
	const shown = picture !== undefined && picture !== failed ? picture : undefined;
	// On its way: loading, or not yet taken by a pass that is drawing. One that failed to load is not waited for.
	const waiting = shown ? loaded !== shown : drawing && picture === undefined;
	return (
		<Card
			data-component-card={component.id}
			className={`pt-0 ${PRESSABLE_CARD}`}
			{...pressableCard(`Open ${component.name}${issues?.violations ? `, ${summaryOf(issues)}` : ''}`, onOpen)}
		>
			{/* The picture is the cover: edge to edge, with a skeleton behind it until it has loaded. */}
			<CardCover bleed>
				<div data-picture-area className={`absolute inset-0 ${shown && loaded === shown ? 'bg-white' : 'bg-muted/40'}`}>
					{waiting && <Skeleton data-picture-waiting className="absolute inset-0 rounded-none" />}
					{issues && issues.violations > 0 && (
						<Badge variant="secondary" data-accessibility-issues={issues.violations} title={summaryOf(issues)} className="absolute top-2 right-2 z-10">
							<AccessibilityIcon aria-hidden />
							{issues.violations}
						</Badge>
					)}
					{shown && (
						<img
							src={shown}
							alt=""
							decoding="async"
							onLoad={() => setLoaded(shown)}
							onError={() => setFailed(shown)}
							className={`size-full object-contain transition-opacity duration-200 motion-reduce:transition-none ${loaded === shown ? 'opacity-100' : 'opacity-0'}`}
						/>
					)}
				</div>
			</CardCover>
			<CardFooter className="mt-auto flex h-12 items-center justify-between gap-2 pr-3 pl-4.5">
				<CardTitle className="truncate text-sm font-semibold">{component.name}</CardTitle>
				<span className="text-muted-foreground shrink-0 truncate text-sm">{component.group}</span>
			</CardFooter>
		</Card>
	);
};
