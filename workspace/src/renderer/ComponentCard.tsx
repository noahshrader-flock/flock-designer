import { useState } from 'react';
import type { CatalogComponent } from '../shared/contract';
import { CardCover } from './CardCover';
import { PRESSABLE_CARD, pressableCard } from './pressableCard';
import { Card, CardFooter, CardTitle } from './ui/card';

/**
 * A component in the grid view (P5 of the design system plan, decision 31): the Projects card, its cover a picture of the
 * component's first story, filling the cover edge to edge (it is taken in the cover's own shape, around the component),
 * its footer the component's name and its group. The cover is the same size with or without a picture, so nothing moves
 * when one arrives: a soft placeholder until there is one, and the picture fades in once it has loaded. The picture is
 * decorative: the name is beside it. The whole card opens the component.
 */
export const ComponentCard = ({ component, picture, onOpen }: { component: CatalogComponent; picture: string | undefined; onOpen: () => void }) => {
	const [loaded, setLoaded] = useState<string | null>(null);
	// A picture that would not load is no picture: the placeholder, never a white block.
	const [failed, setFailed] = useState<string | null>(null);
	const shown = picture !== undefined && picture !== failed ? picture : undefined;
	return (
		<Card data-component-card={component.id} className={`pt-0 ${PRESSABLE_CARD}`} {...pressableCard(`Open ${component.name}`, onOpen)}>
			{/* The picture is the cover: edge to edge, with a soft gray behind it until it has loaded. */}
			<CardCover bleed>
				<div data-picture-area className={`absolute inset-0 ${shown && loaded === shown ? 'bg-white' : 'bg-muted/40'}`}>
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
