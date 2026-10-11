import { AccessibilityIcon } from 'lucide-react';
import { summaryOf } from '../shared/accessibility';
import type { AccessibilityCounts, CatalogComponent } from '../shared/contract';
import { CardCover } from './CardCover';
import { CARD_DETAIL, CARD_NAME, COMPONENT_FOOTER } from './cardFooters';
import { PictureArea } from './PictureArea';
import { PRESSABLE_CARD, pressableCard } from './pressableCard';
import { Badge } from './ui/badge';
import { Card, CardFooter, CardTitle } from './ui/card';

/**
 * A component in the grid view (P5 of the design system plan, decision 31): the Projects card, its cover the component's
 * picture (`PictureArea`: edge to edge, taken in the cover's own shape), its footer the component's name and its group.
 * The whole card opens the component.
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
	return (
		<Card
			data-component-card={component.id}
			className={`pt-0 ${PRESSABLE_CARD}`}
			{...pressableCard(`Open ${component.name}${issues?.violations ? `, ${summaryOf(issues)}` : ''}`, onOpen)}
		>
			<CardCover>
				<PictureArea picture={picture} drawing={drawing}>
					{issues && issues.violations > 0 && (
						<Badge variant="secondary" data-accessibility-issues={issues.violations} title={summaryOf(issues)} className="absolute top-2 right-2 z-10">
							<AccessibilityIcon aria-hidden />
							{issues.violations}
						</Badge>
					)}
				</PictureArea>
			</CardCover>
			<CardFooter className={COMPONENT_FOOTER}>
				<CardTitle className={CARD_NAME}>{component.name}</CardTitle>
				<span className={`${CARD_DETAIL} shrink-0 truncate`}>{component.group}</span>
			</CardFooter>
		</Card>
	);
};
