import { useState } from 'react';
import type { CatalogComponent } from '../shared/contract';
import { CardCover } from './CardCover';
import { PRESSABLE_CARD, pressableCard } from './pressableCard';
import { Card, CardFooter, CardTitle } from './ui/card';

/**
 * A component in the grid view (P5 of the design system plan, decision 31): the Projects card, its cover a picture of the
 * component's first story, centered in the cover whatever its shape, its footer the component's name and its group. The
 * cover is the same size with or without a picture, so nothing moves when one arrives: a soft placeholder until there is
 * one, and the picture fades in once it has loaded. The picture is decorative: the name is beside it. The whole card
 * opens the component.
 */
export const ComponentCard = ({ component, picture, onOpen }: { component: CatalogComponent; picture: string | undefined; onOpen: () => void }) => {
	const [loaded, setLoaded] = useState<string | null>(null);
	return (
		<Card data-component-card={component.id} className={`pt-0 ${PRESSABLE_CARD}`} {...pressableCard(`Open ${component.name}`, onOpen)}>
			<CardCover>
				{/* White behind a picture, as the stories are drawn on white (the preview page's own); a soft gray until there is one. */}
				<div
					data-picture-area
					className={`relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-md ${picture ? 'bg-white' : 'bg-muted/40'}`}
				>
					{picture && (
						<img
							src={picture}
							// Taken at twice the size it is shown, so it is drawn at half its pixels and stays sharp.
							srcSet={`${picture} 2x`}
							alt=""
							decoding="async"
							onLoad={() => setLoaded(picture)}
							className={`max-h-full max-w-full object-contain transition-opacity duration-200 motion-reduce:transition-none ${loaded === picture ? 'opacity-100' : 'opacity-0'}`}
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
